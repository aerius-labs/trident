export class CircularBuffer<T> {
    private buffer: T[];
    private start = 0;
    private size = 0;

    constructor(private capacity: number) {
        this.buffer = new Array(capacity);
    }

    push(item: T): void {
        if (this.size < this.capacity) {
            this.buffer[(this.start + this.size) % this.capacity] = item;
            this.size++;
        } else {
            this.buffer[this.start] = item;
            this.start = (this.start + 1) % this.capacity;
        }
    }

    getItems(): T[] {
        return [...this.buffer.slice(this.start, this.capacity), ...this.buffer.slice(0, this.start)].slice(0, this.size);
    }
}