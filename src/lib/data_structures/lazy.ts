export class Lazy<T> {
  #value?: T;

  constructor(private readonly resolver: () => Promise<T>) {}

  async value(): Promise<T> {
    if (!this.#value) {
      this.#value = await this.resolver();
    }

    return this.#value;
  }
}