export class Lazy<T> {
  #value?: T;
  #resolver: () => Promise<T>;

  constructor(resolver: () => Promise<T>) {
    this.#resolver = resolver;
  }

  async value(): Promise<T> {
    if (!this.#value) {
      this.#value = await this.#resolver();
    }

    return this.#value;
  }
}