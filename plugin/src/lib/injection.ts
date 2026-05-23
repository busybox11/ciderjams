import {
  type App,
  type AppContext,
  type Component,
  getCurrentInstance,
  h,
  onMounted,
  onUpdated,
  render,
} from "vue";


import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "injection");

export type InjectorMatch = (component: any, el: HTMLElement) => boolean;
/** return false to skip marking the host so a later updated cycle can retry */
export type InjectorAction = (component: any, el: HTMLElement) => boolean | undefined;

export interface Injector {
  /** predicate evaluated for every candidate */
  match: InjectorMatch;
  /** run once per element, after `match` succeeds */
  inject: InjectorAction;
  /**
   * limit dispatch to a specific component definition by patching its
   * lifecycle hooks directly. Useful for components outside the host app's
   * mixin reach (e.g. `__PLUGINSYS__` registered components)
   */
  target?: any;
  /** override the per-element marker key (defaults to a shared symbol) */
  key?: string | symbol;
}

const DEFAULT_KEY = Symbol("injection.applied");
const SETUP_KEY = Symbol.for("ciderjams.injection.setup");
const PATCHED = new WeakSet<any>();
const globalInjectors: Injector[] = [];
const targetedInjectors = new WeakMap<any, Injector[]>();

function dispatch(component: any, list: Injector[]) {
  const el = component?.$el as HTMLElement | undefined;
  if (!el || !(el as any).style) return;
  for (const inj of list) {
    const key = inj.key ?? DEFAULT_KEY;
    // @ts-expect-error: dynamic marker
    if (el[key]) continue;
    if (!inj.match(component, el)) continue;
    if (inj.inject(component, el) === false) continue;
    // @ts-expect-error: dynamic marker
    el[key] = true;
  }
}

type LifecycleHook = "mounted" | "updated";

/** fallback for options-API components without a setup() function */
function appendLifecycleHook(opts: any, hook: LifecycleHook, fn: (this: any) => void) {
  const existing = opts[hook];
  if (Array.isArray(existing)) {
    existing.push(fn);
  } else if (existing) {
    opts[hook] = [existing, fn];
  } else {
    opts[hook] = fn;
  }
}

function patchTargetLifecycle(target: any) {
  if (PATCHED.has(target)) return;
  PATCHED.add(target);

  if (typeof target.setup === "function") {
    const origSetup = target.setup;
    target.setup = (props: unknown, ctx: unknown) => {
      const result = origSetup(props, ctx);
      const fire = () => {
        const proxy = getCurrentInstance()?.proxy;
        if (proxy) dispatch(proxy, targetedInjectors.get(target) ?? []);
      };
      onMounted(fire);
      onUpdated(fire);
      return result;
    };
    return;
  }

  const fire = function (this: unknown) {
    dispatch(this, targetedInjectors.get(target) ?? []);
  };
  for (const hook of ["mounted", "updated"] as const) {
    appendLifecycleHook(target.__vccOpts ?? target, hook, fire);
  }
}

/**
 * installs a global mixin on `app` that fires every non-targeted injector
 * on `mounted` and `updated`. call once at module load
 */
export function setupInjection(app: App | { mixin?: (m: any) => void }) {
  if (!app || typeof app.mixin !== "function") {
    log.warn("setupInjection: app.mixin is not available", app);
    return;
  }
  if ((app as { [SETUP_KEY]?: boolean })[SETUP_KEY]) return;
  (app as { [SETUP_KEY]?: boolean })[SETUP_KEY] = true;
  log.log("setting up injection", app);
  const fire = function (this: any) {
    dispatch(this, globalInjectors);
  };
  app.mixin({ mounted: fire, updated: fire });
}

export function registerInjector(injector: Injector) {
  if (injector.target) {
    patchTargetLifecycle(injector.target);
    const list = targetedInjectors.get(injector.target) ?? [];
    list.push(injector);
    targetedInjectors.set(injector.target, list);
    return;
  }
  globalInjectors.push(injector);
}

/**
 * mounts a Vue `component` as a child of `host`, reusing the plugin's app
 * context so global plugins (Pinia, etc.) remain available
 */
export function mountInto<
  T extends Component,
  // try to infer props type from component
  // vue components in TS often have a `__props` property (defineProps/defineComponent)
  P = T extends { __props?: infer Props }
    ? Props
    : T extends new (
          ...args: any
        ) => { $props: infer Props2 }
      ? Props2
      : Record<string, any>,
>(component: T, host: HTMLElement, appContext?: AppContext, props?: P) {
  const vnode = h(component, props ?? {});
  // @ts-expect-error: appContext is internal but writable
  vnode.appContext = appContext ?? window.__PLUGINSYS__.App.vue._context;
  render(vnode, host);
  if (vnode.el) host.appendChild(vnode.el as unknown as Node);
  return vnode;
}
