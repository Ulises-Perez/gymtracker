import { v7 as uuidv7 } from 'uuid';

/**
 * Primary keys are generated on the client, never by the database.
 *
 * A workout recorded offline must already have its final id before the server
 * has ever seen it, otherwise every retry would create a duplicate. Version 7
 * rather than 4 because v7 is time-ordered: ids sort by creation time and index
 * inserts stay local instead of scattering across the B-tree. Postgres cannot
 * generate v7 natively, which is why the client owns this.
 */
export function newId(): string {
  return uuidv7();
}
