const stores = new Map<string, unknown>();

export function __setMockStore(name: string, store: unknown) {
    stores.set(name, store);
}

export function __resetMockStores() {
    stores.clear();
}

export function findStoreLazy(name: string) {
    return stores.get(name);
}

export function findByPropsLazy(..._props: string[]) {
    return {};
}

