import { createServer, type Server, type ServerResponse } from 'node:http';
import { assignOrder, getLoad, type State } from './service.ts';
import { isValidDate } from './time.ts';

export function createApp(state: State): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/branches') {
        return send(res, 200, state.branches);
      }

      if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
        const order = state.orders.find((o) => o.id === parts[1]);
        if (!order) return send(res, 404, { error: 'order_not_found' });
        return send(res, 200, order);
      }

      if (req.method === 'POST' && parts[0] === 'orders' && parts.length === 3 && parts[2] === 'assign') {
        const assignment = assignOrder(state, decodeURIComponent(parts[1]));
        if (!assignment) return send(res, 404, { error: 'order_not_found' });
        return send(res, 200, assignment);
      }

      if (req.method === 'GET' && parts[0] === 'branches' && parts.length === 3 && parts[2] === 'load') {
        const date = url.searchParams.get('date');
        if (!date || !isValidDate(date)) return send(res, 400, { error: 'invalid_date' });
        const branchId = decodeURIComponent(parts[1]);
        const branch = state.branches.find((b) => b.id === branchId);
        if (!branch) return send(res, 404, { error: 'branch_not_found' });
        return send(res, 200, {
          branchId: branch.id,
          date,
          assigned: getLoad(state, branch.id, date),
          limit: branch.dailyLimit,
        });
      }

      send(res, 404, { error: 'not_found' });
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'internal' });
    }
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
