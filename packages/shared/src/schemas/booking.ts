import { z } from 'zod';
import { Uuid, Pesewas, IsoDateTime } from './common';

export const BookingStatus = z.enum(['quote', 'reserved', 'out', 'returned', 'cancelled']);

/** Status transitions allowed from each state. UI uses this to gate actions. */
export const BOOKING_STATUS_LABELS = {
  quote: 'Quote',
  reserved: 'Reserved',
  out: 'Checked out',
  returned: 'Returned',
  cancelled: 'Cancelled',
} as const satisfies Record<z.infer<typeof BookingStatus>, string>;

export const BOOKING_STATUS_TRANSITIONS: Record<
  z.infer<typeof BookingStatus>,
  ReadonlyArray<z.infer<typeof BookingStatus>>
> = {
  quote: ['reserved', 'out', 'cancelled'],
  reserved: ['out', 'cancelled'],
  out: ['returned'],
  returned: [],
  cancelled: [],
};

export const Booking = z.object({
  id: Uuid,
  tenant_id: Uuid,
  customer_id: Uuid.nullable(),
  renter_name: z.string().min(1).max(200).nullable(),
  status: BookingStatus,
  starts_at: IsoDateTime,
  ends_at: IsoDateTime,
  pickup_location: z.string().max(200).nullable(),
  dropoff_location: z.string().max(200).nullable(),
  driver_name: z.string().max(120).nullable(),
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const BookingLine = z.object({
  id: Uuid,
  tenant_id: Uuid,
  booking_id: Uuid,
  item_id: Uuid,
  item_unit_id: Uuid.nullable(),
  quantity: z.number().int().positive(),
  daily_rate_pesewas: Pesewas,
  odometer_start_km: z.number().int().nonnegative().nullable(),
  odometer_end_km: z.number().int().nonnegative().nullable(),
  fuel_litres_start: z.number().nonnegative().nullable(),
  fuel_litres_end: z.number().nonnegative().nullable(),
  notes: z.string().max(2000).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const BookingLineCreateInput = BookingLine.omit({
  id: true,
  tenant_id: true,
  booking_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const BookingCreateInput = Booking
  .omit({
    id: true,
    tenant_id: true,
    status: true,
    created_at: true,
    updated_at: true,
    deleted_at: true,
  })
  .extend({
    status: BookingStatus.optional().default('quote'),
    lines: z.array(BookingLineCreateInput).min(1, 'A booking needs at least one line'),
  })
  .refine((b) => new Date(b.starts_at) < new Date(b.ends_at), {
    message: 'starts_at must be earlier than ends_at',
    path: ['ends_at'],
  });

export const BookingUpdateInput = Booking.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
}).partial();

export const BookingFilter = z.object({
  status: BookingStatus.optional(),
  customerId: Uuid.optional(),
  windowStart: IsoDateTime.optional(),
  windowEnd: IsoDateTime.optional(),
  search: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().optional(),
});

export const ConflictCheckInput = z.object({
  starts_at: IsoDateTime,
  ends_at: IsoDateTime,
  lines: z.array(
    z.object({
      item_id: Uuid,
      item_unit_id: Uuid.nullable().optional(),
      quantity: z.number().int().positive(),
    }),
  ),
  excludeBookingId: Uuid.optional(),
});

export const ConflictReport = z.object({
  itemId: Uuid,
  itemName: z.string(),
  unitId: Uuid.nullable(),
  unitIdentifier: z.string().nullable(),
  requested: z.number().int().positive(),
  alreadyHeld: z.number().int().nonnegative(),
  available: z.number().int(),
  total: z.number().int().nonnegative(),
  conflictingBookings: z.array(
    z.object({
      id: Uuid,
      starts_at: IsoDateTime,
      ends_at: IsoDateTime,
      customer_name: z.string(),
      status: BookingStatus,
    }),
  ),
});

export type Booking = z.infer<typeof Booking>;
export type BookingStatus = z.infer<typeof BookingStatus>;
export type BookingLine = z.infer<typeof BookingLine>;
export type BookingCreateInput = z.infer<typeof BookingCreateInput>;
export type BookingLineCreateInput = z.infer<typeof BookingLineCreateInput>;
export type BookingUpdateInput = z.infer<typeof BookingUpdateInput>;
export type BookingFilter = z.infer<typeof BookingFilter>;
export type ConflictCheckInput = z.infer<typeof ConflictCheckInput>;
export type ConflictReport = z.infer<typeof ConflictReport>;
