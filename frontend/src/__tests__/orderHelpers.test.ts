import { describe, expect, it } from 'vitest';
import { isAssignableForDelivery, isQueuedForProduction } from '../lib/orderHelpers';

describe('catering order workflow status helpers', () => {
  it('keeps confirmed paid orders in the production queue', () => {
    expect(isQueuedForProduction('PENDING')).toBe(true);
    expect(isQueuedForProduction('CONFIRMED')).toBe(true);
    expect(isQueuedForProduction('IN_PRODUCTION')).toBe(false);
  });

  it('allows confirmed orders to be assigned to a courier before dispatch', () => {
    expect(isAssignableForDelivery('CONFIRMED')).toBe(true);
    expect(isAssignableForDelivery('IN_PRODUCTION')).toBe(true);
    expect(isAssignableForDelivery('READY_TO_DELIVER')).toBe(true);
    expect(isAssignableForDelivery('COMPLETED')).toBe(false);
  });
});
