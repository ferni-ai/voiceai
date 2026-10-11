/**
 * The food delivery tool only builds cart links; the person checks out and
 * pays on DoorDash or Uber Eats themselves. Its words must never claim or
 * offer that Ferni orders: "Your order is ready!" after `checkout` read as a
 * placed order. Goes through the real calendar domain's foodDelivery tool
 * and the real in-memory cart; no network (no delivery API keys in tests,
 * so search returns its offline search link).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Words that claim or offer a placed order. */
const ORDER_CLAIM =
  /order is ready|help you order|complete the order|complete order|complete payment|placed (the|your) order|order (is|was) placed|ready to order/i;

afterEach(() => {
  vi.resetModules();
});

let registryDescription = '';

type Executable = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

async function foodDelivery(): Promise<Executable> {
  const { autoRegisterAllDomains, loadToolDomainsLazy } = await import('../../registry/loader.js');
  const { toolRegistry } = await import('../../registry/index.js');
  const { EnvironmentServiceRegistry } = await import('../../registry/types.js');
  await autoRegisterAllDomains();
  await loadToolDomainsLazy(['calendar']);
  const { tools } = toolRegistry.buildToolSet(
    { domains: ['calendar'] },
    {
      userId: 'u1',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
      services: new EnvironmentServiceRegistry(),
    }
  );
  registryDescription = toolRegistry.get('foodDelivery')?.description ?? '';
  const tool = (tools as unknown as Record<string, Executable>).foodDelivery;
  if (!tool) throw new Error('foodDelivery not built');
  return tool;
}

const ADDRESS = { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' };

describe('foodDelivery says what it does: a cart link they check out themselves', () => {
  it('start → add → checkout → status never claims an order, and says nothing is ordered', async () => {
    const tool = await foodDelivery();
    const started = await tool.execute({
      action: 'start',
      restaurantName: 'Pho Hoa',
      platform: 'doordash',
    });
    const cartId = started.match(/Cart ID: (\S+)/)?.[1];
    expect(cartId).toBeDefined();
    const added = await tool.execute({
      action: 'add',
      orderId: cartId,
      itemName: 'Pho',
      price: 14,
      quantity: 2,
    });
    const checkout = await tool.execute({ action: 'checkout', orderId: cartId });
    const status = await tool.execute({ action: 'status', orderId: cartId });

    for (const out of [started, added, checkout, status]) expect(out).not.toMatch(ORDER_CLAIM);
    expect(started).toContain('Nothing is ordered unless they check out themselves');
    expect(added).toContain('2x Pho ($28.00) to the cart');
    expect(checkout).toContain(
      'Nothing is ordered yet: they open it, review it and pay there themselves'
    );
    expect(status).toContain('Your cart for Pho Hoa (not ordered yet): 2x Pho');
  });

  it('search and quick say they order it themselves', async () => {
    const tool = await foodDelivery();
    const search = await tool.execute({
      action: 'search',
      query: 'pho',
      ...ADDRESS,
      platform: 'doordash',
    });
    const quick = await tool.execute({
      action: 'quick',
      query: 'pho',
      ...ADDRESS,
      platform: 'doordash',
    });
    for (const out of [search, quick]) expect(out).not.toMatch(ORDER_CLAIM);
    expect(search).toContain("I'll put together a cart link you can check out yourself");
    expect(quick).toContain(
      'Their page (they order it themselves): https://www.doordash.com/search/store/pho/'
    );
  });

  it('the descriptions the model reads say it never places an order', async () => {
    const { getToolDescription } = await import('../../utils/tool-descriptions.js');
    for (const id of [
      'foodDelivery',
      'searchFoodDelivery',
      'startFoodOrder',
      'addItemToOrder',
      'checkoutOrder',
      'getOrderStatus',
      'quickFoodOrder',
    ]) {
      expect(getToolDescription(id)).not.toMatch(ORDER_CLAIM);
    }
    expect(getToolDescription('foodDelivery')).toContain('You never place an order');
    await foodDelivery(); // the registry's own description of the tool
    expect(registryDescription).toContain('link they check out themselves');
    expect(registryDescription).not.toMatch(/order food/i);
    expect(getToolDescription('checkoutOrder')).toContain('Nothing is ordered or charged by you');
  });

  it('the completion message points them to check out themselves', async () => {
    const { startOrder, finalizeOrder, getOrderCompletionMessage } =
      await import('../../../services/external-apis/food-delivery.js');
    const cart = startOrder({
      id: 'doordash_x',
      platform: 'doordash',
      name: 'Pho Hoa',
      cuisines: [],
      isOpen: true,
      acceptsOrders: true,
      menuUrl: 'https://www.doordash.com/store/pho-hoa/',
      deepLink: 'doordash://store/x',
    });
    const done = finalizeOrder(cart.id)!;
    const message = getOrderCompletionMessage(done);
    expect(message).not.toMatch(ORDER_CLAIM);
    expect(message).toContain('Your Pho Hoa cart is ready to check out yourself');
  });
});
