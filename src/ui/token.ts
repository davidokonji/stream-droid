export const controlToken = (): string => new URLSearchParams(location.search).get('k') ?? '';
