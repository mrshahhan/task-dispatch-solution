import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { assignOrder, createState, getLoad } from '../src/service.ts';
import { almatyDate, isValidDate } from '../src/time.ts';
import type { Branch, Order } from '../src/types.ts';

const read = <T>(f: string): T =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', f), 'utf8')) as T;
const fresh = () => createState(read<Branch[]>('branches.json'), read<Order[]>('orders.json'));

test('almatyDate: сутки считаются по UTC+5', () => {
  assert.equal(almatyDate('2026-11-15T19:30:00Z'), '2026-11-16');
  assert.equal(almatyDate('2026-11-15T18:50:00Z'), '2026-11-15');
  assert.equal(almatyDate('2026-11-16T19:10:00Z'), '2026-11-17');
});

test('isValidDate', () => {
  assert.ok(isValidDate('2026-11-16'));
  assert.ok(!isValidDate('2026-02-31'));
  assert.ok(!isValidDate('2026-11-1'));
  assert.ok(!isValidDate('abc'));
});

test('assignOrder: неизвестный заказ', () => {
  assert.equal(assignOrder(fresh(), 'nope'), null);
});

test('assignOrder: повторный вызов не занимает лимит дважды', () => {
  const s = fresh();
  const a = assignOrder(s, 'o-101');
  const b = assignOrder(s, 'o-101');
  assert.deepEqual(a, { orderId: 'o-101', branchId: 'b-ala-1', rule: 'pickup_point' });
  assert.equal(b, a);
  assert.equal(getLoad(s, 'b-ala-1', '2026-11-16'), 1);
});

test('лимит: 4-й заказ b-ala-1 за сутки по Алматы уходит в ближайший свободный', () => {
  const s = fresh();
  // o-101 (00:30 по Алматы 16-го), o-109, o-110 заполняют лимит 3; o-113 — 15-е число
  for (const id of ['o-101', 'o-109', 'o-110']) assert.equal(assignOrder(s, id)?.branchId, 'b-ala-1');
  assert.equal(getLoad(s, 'b-ala-1', '2026-11-16'), 3);
  assert.deepEqual(assignOrder(s, 'o-111'), { orderId: 'o-111', branchId: 'b-ala-2', rule: 'geo' });
  // o-113 создан 15-го по Алматы — свои сутки, лимит не заполнен
  assert.equal(assignOrder(s, 'o-113')?.branchId, 'b-ala-1');
  assert.equal(getLoad(s, 'b-ala-1', '2026-11-15'), 1);
});

test('лимит: manual занимает загрузку, но не проверяет лимит', () => {
  const s = fresh();
  for (const id of ['o-101', 'o-109', 'o-110']) assignOrder(s, id);
  const o = s.orders.find((x) => x.id === 'o-111')!;
  o.manualBranchId = 'b-ala-1';
  assert.equal(assignOrder(s, 'o-111')?.rule, 'manual');
  assert.equal(getLoad(s, 'b-ala-1', '2026-11-16'), 4);
});

test('unassigned не занимает лимит и кешируется', () => {
  const s = fresh();
  assert.deepEqual(assignOrder(s, 'o-106'), { orderId: 'o-106', branchId: null, rule: 'unassigned' });
  assert.equal(s.assignments.size, 1);
});

async function withApp(state: ReturnType<typeof fresh>, fn: (base: string) => Promise<void>) {
  const server = createApp(state);
  await new Promise<void>((r) => server.listen(0, r));
  try {
    await fn(`http://localhost:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('API: POST /orders/:id/assign', async () => {
  await withApp(fresh(), async (base) => {
    const r1 = await fetch(`${base}/orders/o-101/assign`, { method: 'POST' });
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { orderId: 'o-101', branchId: 'b-ala-1', rule: 'pickup_point' });
    const r2 = await fetch(`${base}/orders/o-101/assign`, { method: 'POST' });
    assert.deepEqual(await r2.json(), { orderId: 'o-101', branchId: 'b-ala-1', rule: 'pickup_point' });
    const load = await (await fetch(`${base}/branches/b-ala-1/load?date=2026-11-16`)).json();
    assert.deepEqual(load, { branchId: 'b-ala-1', date: '2026-11-16', assigned: 1, limit: 3 });
    assert.equal((await fetch(`${base}/orders/nope/assign`, { method: 'POST' })).status, 404);
  });
});

test('API: GET /branches/:id/load — ошибки', async () => {
  await withApp(fresh(), async (base) => {
    assert.equal((await fetch(`${base}/branches/b-ala-1/load`)).status, 400);
    assert.equal((await fetch(`${base}/branches/b-ala-1/load?date=2026-13-40`)).status, 400);
    assert.equal((await fetch(`${base}/branches/b-ala-1/load?date=abc`)).status, 400);
    assert.equal((await fetch(`${base}/branches/nope/load?date=2026-11-16`)).status, 404);
    const ok = await (await fetch(`${base}/branches/b-ala-2/load?date=2026-11-16`)).json();
    assert.deepEqual(ok, { branchId: 'b-ala-2', date: '2026-11-16', assigned: 0, limit: 40 });
  });
});
