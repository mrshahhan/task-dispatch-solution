import type { Assignment, Branch, Order } from './types.ts';
import { distanceKm } from './geo.ts';

export type IsFull = (branchId: string) => boolean;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Выбирает филиал для заказа.
 * `isFull` сообщает, исчерпан ли дневной лимит филиала на сутки заказа.
 * Функция чистая: счётчики загрузки живут снаружи (см. service.ts).
 */
export function assignBranch(order: Order, branches: Branch[], isFull: IsFull = () => false): Assignment {
  const own = branches.filter((b) => b.storeId === order.storeId && b.active);
  const result = (branchId: string | null, rule: Assignment['rule']): Assignment => ({
    orderId: order.id,
    branchId,
    rule,
  });

  // manual: решение менеджера, лимит не проверяется
  if (order.manualBranchId) {
    const manual = own.find((b) => b.id === order.manualBranchId);
    if (manual) return result(manual.id, 'manual');
  }

  const picked = pick(order, own);
  if (!picked) return result(null, 'unassigned');
  if (!isFull(picked.branch.id)) return result(picked.branch.id, picked.rule);

  // выбранный филиал заполнен: ближайший незаполненный филиал магазина по geo
  const fallback = findNearest(
    order,
    own.filter((b) => !isFull(b.id)),
  );
  return fallback ? result(fallback.id, 'geo') : result(null, 'unassigned');
}

function pick(order: Order, own: Branch[]): { branch: Branch; rule: Assignment['rule'] } | null {
  if (own.length === 0) return null;

  if (own.length === 1) return { branch: own[0], rule: 'single' };

  if (order.pickupPointId) {
    const byPoint = own.find((b) => b.pickupPointIds.includes(order.pickupPointId as string));
    if (byPoint) return { branch: byPoint, rule: 'pickup_point' };
  }

  const inCity = own.filter((b) => norm(b.city) === norm(order.city));
  if (inCity.length === 1) return { branch: inCity[0], rule: 'city' };

  const nearest = findNearest(order, inCity.length > 1 ? inCity : own);
  return nearest ? { branch: nearest, rule: 'geo' } : null;
}

function findNearest(order: Order, branches: Branch[]): Branch | null {
  if (order.lat === null || order.lon === null) return null;

  let best: Branch | null = null;
  let bestDist = Infinity;
  for (const b of branches) {
    const d = distanceKm(order.lat, order.lon, b.lat, b.lon);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}
