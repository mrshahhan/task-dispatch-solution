import type { Assignment, Branch, Order } from './types.ts';
import { assignBranch } from './router.ts';
import { almatyDate } from './time.ts';

export type State = {
  branches: Branch[];
  orders: Order[];
  // orderId -> распределение (в том числе unassigned): делает повторный вызов идемпотентным
  assignments: Map<string, Assignment>;
  // `${branchId}|${date}` -> сколько заказов занимает лимит
  load: Map<string, number>;
};

export function createState(branches: Branch[], orders: Order[]): State {
  return { branches, orders, assignments: new Map(), load: new Map() };
}

const loadKey = (branchId: string, date: string) => `${branchId}|${date}`;

export function getLoad(state: State, branchId: string, date: string): number {
  return state.load.get(loadKey(branchId, date)) ?? 0;
}

/** Распределяет заказ. null — заказа нет. Повторный вызов возвращает прежний результат. */
export function assignOrder(state: State, orderId: string): Assignment | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;

  const existing = state.assignments.get(orderId);
  if (existing) return existing;

  // Проверка лимита и запись счётчика выполняются синхронно, без await между ними:
  // в одном процессе два запроса не могут занять последнее место одновременно.
  const date = almatyDate(order.createdAt);
  const limits = new Map<string, number>(state.branches.map((b): [string, number] => [b.id, b.dailyLimit]));
  const isFull = (branchId: string) => getLoad(state, branchId, date) >= (limits.get(branchId) ?? 0);

  const assignment = assignBranch(order, state.branches, isFull);
  state.assignments.set(orderId, assignment);
  if (assignment.branchId) {
    const key = loadKey(assignment.branchId, date);
    state.load.set(key, (state.load.get(key) ?? 0) + 1);
  }
  return assignment;
}
