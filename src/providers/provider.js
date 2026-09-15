/** Provider implementations must enumerate only the signed-in user’s library
 * and return neutral provider records. They never receive a password field. */
export class LibraryProvider {
  constructor(id) {
    this.id = id;
  }

  async getStatus() {
    throw new Error(`${this.id}: getStatus is not implemented.`);
  }

  async connect() {
    throw new Error(`${this.id}: connect is not implemented.`);
  }

  async sync() {
    throw new Error(`${this.id}: sync is not implemented.`);
  }

  async disconnect() {
    throw new Error(`${this.id}: disconnect is not implemented.`);
  }
}
