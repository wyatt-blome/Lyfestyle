"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { addItem, forgetProduct, matchWalmartProducts, rememberProduct, removeItem, setAlwaysHave, setInCart, setItemStatus, updateItems } from "@/actions/list";
import { setStore } from "@/actions/household";
import { Icon } from "@/components/icons";
import { Button, Card, cx, ErrorText, inputClass, Sheet } from "@/components/ui";
import type { ItemSource } from "@/db/schema";
import { packageCount, searchQuery, searchUrl, walmartCartUrl } from "@/lib/stores";

type Store = "walmart" | "sams";

export interface ListItem {
  id: string;
  key: string;
  name: string;
  aisle: string;
  needText: string;
  buyWalmart: string | null;
  buySams: string | null;
  leftoverWalmart: { text: string; waste: number } | null;
  leftoverSams: { text: string; waste: number } | null;
  sources: ItemSource[];
  pantry: boolean;
  manual: boolean;
  status: "have" | "need";
  inCart: boolean;
  updatedBy: string | null;
}

interface Product {
  store: Store;
  key: string;
  productUrl: string;
  itemId: string | null;
}

type Patch = { ids: string[]; status?: "have" | "need"; inCart?: boolean; removed?: boolean };

const STORE_NAME: Record<Store, string> = { walmart: "Walmart", sams: "Sam's Club" };

export function ListView({
  planId,
  store: initialStore,
  items,
  products,
  walmartLookup,
}: {
  planId: string;
  store: Store;
  items: ListItem[];
  products: Product[];
  /** walmart.io keys are set, so products can be found automatically */
  walmartLookup: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"have" | "order">("have");
  const [store, setStoreState] = useState<Store>(initialStore);
  const [detail, setDetail] = useState<ListItem | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const [view, apply] = useOptimistic(items, (state, { ids, removed, ...change }: Patch) => {
    const hit = new Set(ids);
    if (removed) return state.filter((i) => !hit.has(i.id));
    return state.map((i) => (hit.has(i.id) ? { ...i, ...change, ...(change.status === "have" ? { inCart: false } : {}) } : i));
  });

  // The list is shared: pick up changes other household members make.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [router]);

  const patch = (p: Patch, action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      apply(p);
      const res = await action();
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const need = view.filter((i) => i.status === "need");
  const have = view.filter((i) => i.status === "have");
  const productFor = (key: string) => products.find((p) => p.store === store && p.key === key);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1" role="tablist">
        {(
          [
            ["have", `1. What we have`],
            ["order", `2. Order (${need.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx("h-11 rounded-full text-sm font-medium", tab === id ? "bg-brand text-brand-ink" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {tab === "have" ? (
        <HaveStep
          items={view}
          have={have.length}
          onToggle={(i) => patch({ ids: [i.id], status: i.status === "have" ? "need" : "have" }, () => setItemStatus(i.id, i.status === "have" ? "need" : "have"))}
          onSetAll={(ids, status) => patch({ ids, status }, () => updateItems(planId, ids, { status }))}
          onDetail={setDetail}
          onAdd={(text) =>
            start(async () => {
              const res = await addItem(planId, text);
              if (!res.ok) setError(res.error);
              router.refresh();
            })
          }
          onNext={() => setTab("order")}
        />
      ) : (
        <OrderStep
          store={store}
          items={need}
          productFor={productFor}
          onStore={(s) => {
            setStoreState(s);
            start(async () => {
              await setStore(s);
            });
          }}
          onCart={(i) => patch({ ids: [i.id], inCart: !i.inCart }, () => setInCart(i.id, !i.inCart))}
          onCartMany={(ids) => patch({ ids, inCart: true }, () => updateItems(planId, ids, { inCart: true }))}
          walmartLookup={walmartLookup}
          onMatch={async () => {
            const res = await matchWalmartProducts(planId);
            router.refresh();
            return res;
          }}
          onRemember={(i, url) =>
            start(async () => {
              const res = await rememberProduct(store, i.key, url);
              if (!res.ok) setError(res.error);
              router.refresh();
            })
          }
          onDetail={setDetail}
        />
      )}

      <ItemSheet
        key={detail?.id ?? "none"}
        item={detail}
        store={store}
        product={detail ? productFor(detail.key) : undefined}
        onClose={() => setDetail(null)}
        onAlwaysHave={(i, v) => {
          setDetail(null);
          patch({ ids: [i.id], status: v ? "have" : i.status }, () => setAlwaysHave(i.id, v));
        }}
        onRemove={(i) => {
          setDetail(null);
          patch({ ids: [i.id], removed: true }, () => removeItem(i.id));
        }}
        onRemember={(i, url) =>
          start(async () => {
            const res = await rememberProduct(store, i.key, url);
            if (!res.ok) setError(res.error);
            else setDetail(null);
            router.refresh();
          })
        }
        onForget={(i) =>
          start(async () => {
            await forgetProduct(store, i.key);
            router.refresh();
          })
        }
      />
    </div>
  );
}

function groupByAisle(items: ListItem[]) {
  const groups = new Map<string, ListItem[]>();
  for (const i of items) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), i]);
  return [...groups.entries()];
}

function HaveStep({
  items,
  have,
  onToggle,
  onSetAll,
  onDetail,
  onAdd,
  onNext,
}: {
  items: ListItem[];
  have: number;
  onToggle: (i: ListItem) => void;
  onSetAll: (ids: string[], status: "have" | "need") => void;
  onDetail: (i: ListItem) => void;
  onAdd: (text: string) => void;
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const [showPantry, setShowPantry] = useState(false);
  const regular = items.filter((i) => !i.pantry);
  const pantry = items.filter((i) => i.pantry);
  return (
    <>
      <p className="text-sm text-muted">
        Check off anything already in the kitchen. Everything left goes to your order. <span className="font-medium text-ink">{have} of {items.length} checked.</span>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAdd(text.trim());
          setText("");
        }}
        className="flex gap-2"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something else (paper towels, milk…)" className={inputClass} />
        <Button type="submit" aria-label="Add item" disabled={!text.trim()}>
          <Icon name="plus" />
        </Button>
      </form>
      {regular.length ? (
        <SelectAll
          label="We have all of these"
          checked={regular.every((i) => i.status === "have")}
          onChange={(all) => onSetAll(regular.map((i) => i.id), all ? "have" : "need")}
        />
      ) : null}
      {groupByAisle(regular).map(([aisle, list]) => (
        <section key={aisle}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{aisle}</h3>
          <Card className="divide-y divide-line">
            {list.map((i) => (
              <HaveRow key={i.id} item={i} onToggle={onToggle} onDetail={onDetail} />
            ))}
          </Card>
        </section>
      ))}
      {pantry.length ? (
        <section>
          <button type="button" onClick={() => setShowPantry((s) => !s)} className="flex w-full items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted" aria-expanded={showPantry}>
            <span>Usually on hand ({pantry.filter((p) => p.status === "have").length}/{pantry.length} checked)</span>
            <Icon name="chevronRight" className={cx("size-4 transition", showPantry && "rotate-90")} />
          </button>
          {showPantry ? (
            <Card className="mt-1.5 divide-y divide-line">
              {pantry.map((i) => (
                <HaveRow key={i.id} item={i} onToggle={onToggle} onDetail={onDetail} />
              ))}
            </Card>
          ) : (
            <p className="px-1 text-xs text-muted">Salt, oil, spices and other basics start as checked. Open to double-check.</p>
          )}
        </section>
      ) : null}
      <Button variant="primary" size="lg" onClick={onNext}>
        Next: order what&apos;s left <Icon name="chevronRight" />
      </Button>
    </>
  );
}

function HaveRow({ item, onToggle, onDetail }: { item: ListItem; onToggle: (i: ListItem) => void; onDetail: (i: ListItem) => void }) {
  const checked = item.status === "have";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${item.name}: already have it`}
        onClick={() => onToggle(item)}
        className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2 transition", checked ? "border-brand bg-brand text-brand-ink" : "border-line")}
      >
        {checked ? <Icon name="check" className="size-4" /> : null}
      </button>
      <button type="button" onClick={() => onToggle(item)} className="min-w-0 flex-1 text-left">
        <span className={cx("block font-medium leading-snug", checked && "text-muted line-through")}>{item.name}</span>
        {item.needText ? <span className="block text-xs text-muted">{item.needText}</span> : null}
      </button>
      <button type="button" onClick={() => onDetail(item)} aria-label={`Details for ${item.name}`} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2">
        <Icon name="chevronRight" className="size-4" />
      </button>
    </div>
  );
}

function SelectAll({ label, checked, onChange }: { label: string; checked: boolean; onChange: (all: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 px-3 text-sm font-medium">
      <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2", checked ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface")}>
        {checked ? <Icon name="check" className="size-4" /> : null}
      </span>
      {checked ? "Clear all" : label}
    </button>
  );
}

const CART_URL: Record<Store, string> = { walmart: "https://www.walmart.com/cart", sams: "https://www.samsclub.com/cart" };

function OrderStep({
  store,
  items,
  productFor,
  walmartLookup,
  onStore,
  onCart,
  onCartMany,
  onMatch,
  onRemember,
  onDetail,
}: {
  store: Store;
  items: ListItem[];
  productFor: (key: string) => Product | undefined;
  walmartLookup: boolean;
  onStore: (s: Store) => void;
  onCart: (i: ListItem) => void;
  onCartMany: (ids: string[]) => void;
  onMatch: () => Promise<{ ok: true; value: { matched: number; missed: string[] } } | { ok: false; error: string }>;
  onRemember: (i: ListItem, url: string) => void;
  onDetail: (i: ListItem) => void;
}) {
  const [copied, setCopied] = useState(false);
  // Everything not yet in the cart starts selected.
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<ListItem[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchNote, setMatchNote] = useState<string>();
  const buy = (i: ListItem) => (store === "walmart" ? i.buyWalmart : i.buySams);
  const leftover = (i: ListItem) => (store === "walmart" ? i.leftoverWalmart : i.leftoverSams);
  const open = items.filter((i) => !i.inCart);
  const inCart = items.length - open.length;
  const selected = open.filter((i) => !unselected.has(i.id));
  const allSelected = open.length > 0 && selected.length === open.length;

  // Walmart: everything with a known product goes in with one link; the rest are added one by one.
  const oneTap = store === "walmart" ? selected.filter((i) => productFor(i.key)?.itemId) : [];
  const oneTapUrl = walmartCartUrl(oneTap.map((i) => ({ itemId: productFor(i.key)!.itemId!, quantity: packageCount(buy(i)) })));
  const byHand = selected.filter((i) => !oneTap.includes(i));
  const unmatched = store === "walmart" && walmartLookup ? open.filter((i) => !productFor(i.key)?.itemId).length : 0;

  const findProducts = async () => {
    setMatching(true);
    setMatchNote(undefined);
    const res = await onMatch();
    setMatching(false);
    if (!res.ok) setMatchNote(res.error);
    else if (res.value.missed.length) setMatchNote(`Couldn't find ${res.value.missed.join(", ")} at Walmart; those are added one at a time.`);
  };

  const copyList = async () => {
    const text = groupByAisle(items)
      .map(([aisle, list]) => `${aisle}\n${list.map((i) => `- ${i.name}${buy(i) ? ` (${buy(i)})` : ""}`).join("\n")}`)
      .join("\n\n");
    try {
      if (navigator.share) await navigator.share({ title: "Grocery list", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  };

  if (!items.length) {
    return (
      <Card className="p-6 text-center">
        <Icon name="check" className="mx-auto size-8 text-brand" />
        <p className="mt-2 font-display text-xl font-semibold">You have everything</p>
        <p className="text-sm text-muted">Nothing left to order this week.</p>
      </Card>
    );
  }

  const spoilers = items.filter((i) => (leftover(i)?.waste ?? 0) >= 0.2);

  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Store">
        {(["walmart", "sams"] as const).map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={store === s}
            onClick={() => onStore(s)}
            className={cx("flex h-14 flex-col items-center justify-center rounded-2xl border text-sm font-semibold", store === s ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface")}
          >
            {STORE_NAME[s]}
            <span className="text-[11px] font-normal text-muted">{s === "walmart" ? "Regular sizes" : "Bulk sizes"}</span>
          </button>
        ))}
      </div>

      {unmatched > 0 ? (
        <Card className="flex items-center gap-3 p-3 text-sm">
          <span className="min-w-0 flex-1 text-muted">
            {matching ? "Finding Walmart products…" : `${unmatched} item${unmatched === 1 ? "" : "s"} not matched to a Walmart product yet.`}
          </span>
          <Button size="sm" busy={matching} onClick={findProducts}>
            Find products
          </Button>
        </Card>
      ) : null}
      {matchNote ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm">{matchNote}</p> : null}

      <div className="flex items-center justify-between">
        {open.length ? (
          <SelectAll label={`Select all (${open.length})`} checked={allSelected} onChange={(all) => setUnselected(all ? new Set() : new Set(open.map((i) => i.id)))} />
        ) : (
          <span className="px-1 text-sm font-medium text-brand">Everything is in the cart</span>
        )}
        <button type="button" onClick={copyList} className="flex items-center gap-1.5 text-sm font-medium text-brand">
          <Icon name="copy" className="size-4" /> {copied ? "Copied" : "Share list"}
        </button>
      </div>

      {groupByAisle(items).map(([aisle, list]) => (
        <section key={aisle}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{aisle}</h3>
          <Card className="divide-y divide-line">
            {list.map((i) => {
              const product = productFor(i.key);
              const href = product?.productUrl ?? searchUrl(store, searchQuery(i.name, buy(i), store));
              const left = leftover(i);
              const isSelected = !i.inCart && !unselected.has(i.id);
              return (
                <div key={i.id} className={cx("flex items-center gap-3 px-3 py-2.5", i.inCart && "bg-surface-2/50")}>
                  {i.inCart ? (
                    <button
                      type="button"
                      onClick={() => onCart(i)}
                      aria-label={`${i.name} is in the cart. Tap to undo.`}
                      className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
                    >
                      <Icon name="cart" className="size-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Order ${i.name}`}
                      onClick={() =>
                        setUnselected((u) => {
                          const next = new Set(u);
                          if (next.has(i.id)) next.delete(i.id);
                          else next.add(i.id);
                          return next;
                        })
                      }
                      className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2", isSelected ? "border-brand bg-brand text-brand-ink" : "border-line")}
                    >
                      {isSelected ? <Icon name="check" className="size-4" /> : null}
                    </button>
                  )}
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <span className={cx("flex items-center gap-1.5 font-medium leading-snug", i.inCart && "text-muted")}>
                      {i.name}
                      {product ? <Icon name="pin" className="size-3.5 shrink-0 text-brand" /> : null}
                    </span>
                    <span className="block text-xs text-muted">{i.inCart ? "In cart" : buy(i) || i.needText || "Add to cart"}</span>
                    {!i.inCart && left && left.waste >= 0.2 ? <span className="block text-xs text-warn">About {left.text} will be left over</span> : null}
                  </a>
                  <button type="button" onClick={() => onDetail(i)} aria-label={`Details for ${i.name}`} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2">
                    <Icon name="chevronRight" className="size-4" />
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      ))}

      {spoilers.length ? (
        <Card className="p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="leaf" className="size-5 text-brand" /> Extra you&apos;ll have from {STORE_NAME[store]} package sizes
          </p>
          <ul className="mt-1 text-muted">
            {spoilers.map((i) => (
              <li key={i.id}>
                {leftover(i)!.text} {i.name.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Next week&apos;s plan will suggest meals that use these.</p>
        </Card>
      ) : null}

      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {selected.length ? (
          oneTapUrl ? (
            <a
              href={oneTapUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                onCartMany(oneTap.map((i) => i.id));
                if (byHand.length) setRun(byHand);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink"
            >
              <Icon name="cart" /> Add {selected.length} to {STORE_NAME[store]} cart
            </a>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setRun(byHand)}>
              <Icon name="cart" /> Add {selected.length} to {STORE_NAME[store]} cart
            </Button>
          )
        ) : (
          <a href={CART_URL[store]} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
            <Icon name="external" /> Open {STORE_NAME[store]} cart to check out
          </a>
        )}
        {selected.length && byHand.length ? (
          <p className="text-center text-xs text-muted">
            {oneTap.length ? `${oneTap.length} go in with one tap; ` : ""}
            {byHand.length} {byHand.length === 1 ? "is" : "are"} added one at a time{store === "walmart" ? " until their products are saved" : ""}.
          </p>
        ) : inCart ? (
          <p className="text-center text-xs text-muted">{inCart} in cart. Check out in {STORE_NAME[store]} and pick a pickup time.</p>
        ) : null}
      </div>

      <CartRun
        store={store}
        queue={run}
        productFor={productFor}
        buy={buy}
        onAdded={(i) => onCartMany([i.id])}
        onRemember={onRemember}
        onClose={() => setRun(null)}
      />
    </>
  );
}

/** Adding items the store can't take in one go: one item at a time, opening each in the store's app. */
function CartRun({
  store,
  queue,
  productFor,
  buy,
  onAdded,
  onRemember,
  onClose,
}: {
  store: Store;
  queue: ListItem[] | null;
  productFor: (key: string) => Product | undefined;
  buy: (i: ListItem) => string | null;
  onAdded: (i: ListItem) => void;
  onRemember: (i: ListItem, url: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(queue)} onClose={onClose} title={`Add to ${STORE_NAME[store]} cart`}>
      {queue ? <CartRunBody key={queue.map((i) => i.id).join()} {...{ store, queue, productFor, buy, onAdded, onRemember, onClose }} /> : null}
    </Sheet>
  );
}

function CartRunBody({
  store,
  queue,
  productFor,
  buy,
  onAdded,
  onRemember,
  onClose,
}: {
  store: Store;
  queue: ListItem[];
  productFor: (key: string) => Product | undefined;
  buy: (i: ListItem) => string | null;
  onAdded: (i: ListItem) => void;
  onRemember: (i: ListItem, url: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState("");
  const item = queue[index];

  if (!item) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Icon name="check" className="size-10 text-brand" />
        <p className="font-display text-xl font-semibold">All added</p>
        <p className="text-sm text-muted">Now check out in {STORE_NAME[store]} and choose a pickup time.</p>
        <a href={CART_URL[store]} target="_blank" rel="noreferrer" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
          <Icon name="external" /> Open {STORE_NAME[store]} cart
        </a>
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  const product = productFor(item.key);
  const href = product?.productUrl ?? searchUrl(store, searchQuery(item.name, buy(item), store));
  const next = () => {
    setUrl("");
    setIndex((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-brand transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Item {index + 1} of {queue.length}
      </p>
      <div>
        <p className="font-display text-2xl font-semibold">{item.name}</p>
        <p className="text-muted">{buy(item) || item.needText}</p>
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full border border-brand font-medium text-brand">
        <Icon name="external" /> {product ? `Open it in ${STORE_NAME[store]}` : `Find it in ${STORE_NAME[store]}`}
      </a>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={next}>
          Skip
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (url.trim()) onRemember(item, url.trim());
            onAdded(item);
            next();
          }}
        >
          <Icon name="check" /> Added
        </Button>
      </div>
      {!product ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Optional: paste the product&apos;s link ({STORE_NAME[store]} → Share → Copy link) so next week it&apos;s {store === "walmart" ? "added with one tap" : "opened directly"}.
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder={store === "walmart" ? "https://www.walmart.com/ip/…" : "https://www.samsclub.com/p/…"} className={inputClass} />
        </label>
      ) : null}
    </div>
  );
}

function ItemSheet({
  item,
  store,
  product,
  onClose,
  onAlwaysHave,
  onRemove,
  onRemember,
  onForget,
}: {
  item: ListItem | null;
  store: Store;
  product: Product | undefined;
  onClose: () => void;
  onAlwaysHave: (i: ListItem, v: boolean) => void;
  onRemove: (i: ListItem) => void;
  onRemember: (i: ListItem, url: string) => void;
  onForget: (i: ListItem) => void;
}) {
  const [url, setUrl] = useState("");
  const buy = item ? (store === "walmart" ? item.buyWalmart : item.buySams) : null;
  const left = item ? (store === "walmart" ? item.leftoverWalmart : item.leftoverSams) : null;
  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={item?.name ?? ""}>
      {item ? (
        <div className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {item.needText ? (
              <>
                <dt className="text-muted">Recipes need</dt>
                <dd>{item.needText}</dd>
              </>
            ) : null}
            {buy ? (
              <>
                <dt className="text-muted">Buy at {STORE_NAME[store]}</dt>
                <dd>{buy}</dd>
              </>
            ) : null}
            {left ? (
              <>
                <dt className="text-muted">Left over</dt>
                <dd>about {left.text}</dd>
              </>
            ) : null}
            {item.updatedBy ? (
              <>
                <dt className="text-muted">Last changed by</dt>
                <dd>{item.updatedBy}</dd>
              </>
            ) : null}
          </dl>
          {item.sources.length ? (
            <div>
              <p className="mb-1 font-medium">Used in</p>
              <ul className="flex flex-col gap-1 text-muted">
                {item.sources.map((s, i) => (
                  <li key={i}>
                    <span className="text-ink">{s.title}</span>: {s.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-2xl border border-line p-3">
            <p className="font-medium">Your {STORE_NAME[store]} product</p>
            {product ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <a href={product.productUrl} target="_blank" rel="noreferrer" className="truncate text-brand underline underline-offset-2">
                  {product.productUrl.replace(/^https:\/\/(www\.)?/, "")}
                </a>
                <Button size="sm" variant="ghost" onClick={() => onForget(item)}>
                  Forget
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) onRemember(item, url.trim());
                }}
                className="mt-2 flex flex-col gap-2"
              >
                <span className="text-xs text-muted">Found the one you like? Copy its link from {STORE_NAME[store]} (Share → Copy link) and paste it here.</span>
                <div className="flex gap-2">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder={store === "walmart" ? "https://www.walmart.com/ip/…" : "https://www.samsclub.com/p/…"} className={inputClass} />
                  <Button type="submit" disabled={!url.trim()}>
                    Save
                  </Button>
                </div>
              </form>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAlwaysHave(item, !item.pantry)}>
              <Icon name="home" className="size-4" /> {item.pantry ? "We don't always have this" : "We always have this"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => onRemove(item)}>
              <Icon name="trash" className="size-4" /> Remove from list
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
