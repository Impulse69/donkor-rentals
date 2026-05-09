export * as Money from './money';
export * as Schemas from './schemas';
export type { Item, ItemUnit, ItemKind, ItemStatus, ItemUnitStatus, ItemFilter } from './schemas/item';
export type { Customer, CustomerIdType, CustomerFilter } from './schemas/customer';
export type { Uuid } from './schemas/common';
export const APP_LOCALE = 'en-GB' as const;
export const APP_CURRENCY = 'GHS' as const;
export const APP_NAME = 'Donkor & Sons Rentals' as const;
