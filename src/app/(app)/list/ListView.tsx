"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { addItem, forgetProduct, rememberProduct, removeItem, setAlwaysHave, setInCart, setItemStatus } from "@/actions/list";
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

type Patch = { id: string; status?: "have" | "need"; inCart?: boolean; removed?: boolean };

const STORE_NAME: Record<Store, string> = { walmart: "Walmart", sams: "Sam's Club" };

export function ListView({ planId, store: initialStore, items, products }: { planId: string; store: Store; items: ListItem[]; products: Product[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"have" | "order">("have");
  const [store, setStoreState] = useState<Store>(initialStore);
  const [detail, setDetail] = useState<ListItem | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const [view, apply] = useOptimistic(items, (state, p: Patch) =>
    p.removed ? state.filter((i) => i.id !== p.id) : state.map((i) => (i.id === p.id ? { ...i, ...p } : i)),
  );

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
          onToggle={(i) => patch({ id: i.id, status: i.status === "have" ? "need" : "have" }, () => setItemStatus(i.id, i.status === "have" ? "need" : "have"))}
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
          onCart={(i) => patch({ id: i.id, inCart: !i.inCart }, () => setInCart(i.id, !i.inCart))}
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
          patch({ id: i.id, status: v ? "have" : i.status }, () => setAlwaysHave(i.id, v));
        }}
        onRemove={(i) => {
          setDetail(null);
          patch({ id: i.id, removed: true }, () => removeItem(i.id));
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
  onDetail,
  onAdd,
  onNext,
}: {
  items: ListItem[];
  have: number;
  onToggle: (i: ListItem) => void;
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

function OrderStep({
  store,
  items,
  productFor,
  onStore,
  onCart,
  onDetail,
}: {
  store: Store;
  items: ListItem[];
  productFor: (key: string) => Product | undefined;
  onStore: (s: Store) => void;
  onCart: (i: ListItem) => void;
  onDetail: (i: ListItem) => void;
}) {
  const [copied, setCopied] = useState(false);
  const buy = (i: ListItem) => (store === "walmart" ? i.buyWalmart : i.buySams);
  const leftover = (i: ListItem) => (store === "walmart" ? i.leftoverWalmart : i.leftoverSams);
  const inCart = items.filter((i) => i.inCart).length;

  const cartLink = useMemo(() => {
    if (store !== "walmart") return null;
    const withIds = items
      .filter((i) => !i.inCart)
      .map((i) => ({ p: productFor(i.key), i }))
      .filter((x) => x.p?.itemId);
    const url = walmartCartUrl(withIds.map((x) => ({ itemId: x.p!.itemId!, quantity: packageCount(buy(x.i)) })));
    return url ? { url, count: withIds.length } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, store, productFor]);

  const spoilers = items.filter((i) => (leftover(i)?.waste ?? 0) >= 0.2);

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

      <Card className="p-4 text-sm">
        <p className="font-semibold">How pickup ordering works</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
          <li>Tap each item to open it in the {STORE_NAME[store]} app or site and add it to your cart.</li>
          <li>Check it off here as it goes in the cart.</li>
          <li>In {STORE_NAME[store]}, check out and choose a pickup time.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">Pick a product once and save its link (tap the arrow on an item); next week it opens that exact product{store === "walmart" ? ", and saved products can go in your cart in one tap" : ""}.</p>
      </Card>

      {cartLink ? (
        <a href={cartLink.url} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
          <Icon name="cart" /> Add {cartLink.count} saved product{cartLink.count === 1 ? "" : "s"} to Walmart cart
        </a>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          {inCart} of {items.length} in cart
        </span>
        <button type="button" onClick={copyList} className="flex items-center gap-1.5 font-medium text-brand">
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
              return (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={i.inCart}
                    aria-label={`${i.name}: in cart`}
                    onClick={() => onCart(i)}
                    className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2", i.inCart ? "border-brand bg-brand text-brand-ink" : "border-line")}
                  >
                    {i.inCart ? <Icon name="check" className="size-4" /> : null}
                  </button>
                  <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                    <span className={cx("flex items-center gap-1.5 font-medium leading-snug", i.inCart && "text-muted line-through")}>
                      {i.name}
                      {product ? <Icon name="pin" className="size-3.5 shrink-0 text-brand" /> : null}
                    </span>
                    <span className="block text-xs text-muted">{buy(i) || i.needText || "Add to cart"}</span>
                    {left && left.waste >= 0.2 ? <span className="block text-xs text-warn">About {left.text} will be left over</span> : null}
                  </a>
                  <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${i.name} at ${STORE_NAME[store]}`} className="grid size-9 place-items-center rounded-full text-brand hover:bg-brand-soft">
                    <Icon name="external" className="size-4" />
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
    </>
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
