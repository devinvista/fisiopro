/**
 * dbMock — helper de teste para simular o cliente Drizzle (`db` de @workspace/db).
 *
 * Modelo: cada chamada de TOP-LEVEL `db.<select|insert|update|delete>(...)` consome
 * UM resultado da fila. Todas as chamadas encadeadas subsequentes
 * (`.from`, `.where`, `.leftJoin`, `.values`, `.set`, `.returning`, `.limit`,
 * `.orderBy`, `.groupBy`) retornam o mesmo proxy thenable que resolve para
 * aquele resultado.
 *
 * Uso:
 *   const dbMock = createDbMock();
 *   vi.mock("@workspace/db", async () => {
 *     const actual = await vi.importActual<any>("@workspace/db");
 *     return { ...actual, db: dbMock.db };
 *   });
 *
 *   beforeEach(() => dbMock.reset());
 *   it("...", async () => {
 *     dbMock.enqueue([{ id: 1, ... }]);          // 1ª query: select retorna esta linha
 *     dbMock.enqueue(undefined);                 // 2ª query: update sem retorno
 *     dbMock.enqueue([{ id: 99 }]);              // 3ª query: insert.returning
 *     await runAlgumaCoisa();
 *     expect(dbMock.pending()).toBe(0);
 *   });
 */

export type DbMockResult = unknown | (() => unknown);

export interface DbMock {
  db: any;
  enqueue: (...results: DbMockResult[]) => void;
  reset: () => void;
  pending: () => number;
  /** Snapshot do que foi chamado em cada top-level db.X(...) */
  calls: () => string[];
}

export function createDbMock(): DbMock {
  let queue: DbMockResult[] = [];
  const callLog: string[] = [];

  function makeChain(result: unknown): any {
    const handler: ProxyHandler<any> = {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: any, reject?: any) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          return (reject: any) => Promise.resolve(result).catch(reject);
        }
        if (prop === "finally") {
          return (cb: any) => Promise.resolve(result).finally(cb);
        }
        // Qualquer outra propriedade (.from, .where, .values, .set, .returning, etc.)
        // devolve uma função que retorna o mesmo proxy.
        return (..._args: any[]) => proxy;
      },
    };
    const proxy: any = new Proxy(() => undefined, handler);
    return proxy;
  }

  function dequeue(verb: string): unknown {
    callLog.push(verb);
    if (queue.length === 0) {
      throw new Error(
        `[dbMock] queue exhausted on db.${verb}() — chamadas registradas: ${callLog.join(", ")}`,
      );
    }
    const next = queue.shift();
    return typeof next === "function" ? (next as () => unknown)() : next;
  }

  const db = new Proxy({} as any, {
    get(_t, prop: string) {
      return (..._args: any[]) => makeChain(dequeue(prop));
    },
  });

  return {
    db,
    enqueue: (...results) => {
      queue.push(...results);
    },
    reset: () => {
      queue = [];
      callLog.length = 0;
    },
    pending: () => queue.length,
    calls: () => [...callLog],
  };
}
