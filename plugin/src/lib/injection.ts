import { type App, type AppContext, type Component, h, render } from "vue";

export type InjectorMatch = (component: any, el: HTMLElement) => boolean;
export type InjectorAction = (component: any, el: HTMLElement) => void;

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
    // @ts-expect-error: dynamic marker
    el[key] = true;
    inj.inject(component, el);
  }
}

function patchTargetLifecycle(target: any) {
  if (PATCHED.has(target)) return;
  PATCHED.add(target);
  const origMounted = target.mounted;
  const origUpdated = target.updated;
  const fire = function (this: any) {
    dispatch(this, targetedInjectors.get(target) ?? []);
  };
  target.mounted = function () {
    origMounted?.call(this);
    fire.call(this);
  };
  target.updated = function () {
    origUpdated?.call(this);
    fire.call(this);
  };
}

/**
 * installs a global mixin on `app` that fires every non-targeted injector
 * on `mounted` and `updated`. call once at module load
 */
export function setupInjection(app: App | { mixin: (m: any) => void }) {
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
