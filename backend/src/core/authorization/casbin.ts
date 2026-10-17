import { newEnforcer, newModelFromString, StringAdapter, Enforcer } from 'casbin';
import { logger } from '../logging/logger.js';

const rbacModelText = `
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && (r.obj == p.obj || p.obj == "*") && (r.act == p.act || p.act == "*")
`;

// Initial default policies for ALGIONS e-commerce roles
const defaultPolicyText = `
p, ADMIN, *, *

p, MANAGER, products, *
p, MANAGER, categories, *
p, MANAGER, inventory, *
p, MANAGER, orders, *
p, MANAGER, delivery, *
p, MANAGER, promotions, *
p, MANAGER, reports, read
p, MANAGER, reviews, *
p, MANAGER, settings, read

p, STAFF, products, read
p, STAFF, categories, read
p, STAFF, inventory, read
p, STAFF, inventory, write
p, STAFF, orders, read
p, STAFF, orders, update
p, STAFF, delivery, read

p, DELIVERY, orders, read
p, DELIVERY, delivery, read
p, DELIVERY, delivery, update

p, CUSTOMER, products, read
p, CUSTOMER, categories, read
p, CUSTOMER, cart, *
p, CUSTOMER, checkout, *
p, CUSTOMER, orders, create
p, CUSTOMER, orders, read
p, CUSTOMER, reviews, create
p, CUSTOMER, reviews, read
p, CUSTOMER, addresses, *

g, ADMIN, MANAGER
`;

let enforcerInstance: Enforcer | null = null;

export async function getCasbinEnforcer(): Promise<Enforcer> {
  if (enforcerInstance) {
    return enforcerInstance;
  }

  const model = newModelFromString(rbacModelText);
  const adapter = new StringAdapter(defaultPolicyText);

  enforcerInstance = await newEnforcer(model, adapter);
  logger.info('Casbin RBAC Enforcer initialized successfully');
  return enforcerInstance;
}

export async function checkPermission(role: string, resource: string, action: string): Promise<boolean> {
  const enforcer = await getCasbinEnforcer();
  return enforcer.enforce(role, resource, action);
}
