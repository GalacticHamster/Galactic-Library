/* Humble importer. It reads purchases only after the user explicitly starts
 * a sync from Humble's signed-in Purchases page. Redemption values are
 * removed from the response text before it is parsed or handled further. */
(function attachHumbleImporter(global) {
  'use strict';

  const BETWEEN_PURCHASES_MS = 175;
  const REDACTED_REDEMPTION_VALUE = '__GALACTIC_REDACTED_REDEMPTION_VALUE__';

  function compactText(value) {
    return String(value ?? '').replace(/\s+/gu, ' ').trim();
  }

  function orderKey(order) {
    return compactText(order?.gamekey ?? order?.key ?? order?.order_key);
  }

  function redactRedemptionValues(serialized) {
    return String(serialized ?? '').replace(/("(?:redeemed_)?key(?:_val|_value)?"\s*:\s*)"((?:[^"\\]|\\.)*)"/giu, (match, prefix, encodedValue) => `${prefix}${encodedValue.length ? `"${REDACTED_REDEMPTION_VALUE}"` : '""'}`);
  }

  async function fetchJson(path) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (response.status === 401 || response.status === 403) throw new Error('Your Humble login has expired. Sign in and try again.');
    if (!response.ok) throw new Error(`Humble returned ${response.status}.`);
    return response.json();
  }

  async function fetchOrderDetail(purchaseId) {
    const response = await fetch(`/api/v1/order/${encodeURIComponent(purchaseId)}?all_tpkds=true`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (response.status === 401 || response.status === 403) throw new Error('Your Humble login has expired. Sign in and try again.');
    if (!response.ok) throw new Error(`Humble returned ${response.status} while loading a purchase.`);
    // Do not call response.json(): a Humble detail can contain a third-party
    // redemption value. Redaction must happen before JSON parsing.
    return JSON.parse(redactRedemptionValues(await response.text()));
  }

  function normalizeDate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const milliseconds = value < 100000000000 ? value * 1000 : value;
      const date = new Date(milliseconds);
      return Number.isNaN(date.valueOf()) ? null : date.toISOString();
    }
    if (typeof value !== 'string' || !value.trim()) return null;
    if (/^\d{10,13}$/u.test(value.trim())) return normalizeDate(Number(value));
    return Number.isNaN(Date.parse(value)) ? null : value.trim();
  }

  function purchasedAtFrom(order, detail) {
    const records = [order, order?.order, order?.purchase, order?.metadata, detail, detail?.order, detail?.purchase, detail?.metadata];
    const keys = ['purchased_at', 'purchase_date', 'order_date', 'created_at', 'created', 'date', 'timestamp'];
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      for (const key of keys) {
        const date = normalizeDate(record[key]);
        if (date) return date;
      }
    }
    return null;
  }

  function bundleNameFrom(order, detail) {
    return compactText(order?.product?.human_name ?? order?.product ?? detail?.product?.human_name ?? detail?.product ?? order?.name);
  }

  function productKind(product) {
    const serialized = JSON.stringify(product);
    if (/"(?:category|content_type|item_content_type|product_type)"\s*:\s*"(?:game|software|dlc)"/iu.test(serialized)
      || /"(?:platform|platform_name|key_type|storefront)"\s*:\s*"[^"\\]*(?:steam|gog|epic|origin|uplay|ubisoft|ea(?:\s+app)?|itch(?:\.io)?|windows|mac|linux|android|ios)[^"\\]*"/iu.test(serialized)
      || /"(?:platforms|platforms_and_oses)"\s*:\s*(?:\[[^\]]*"(?:steam|gog|epic|windows|mac|linux|android|ios)|\{)/iu.test(serialized)
      || /\.(?:exe|dmg|apk|appimage|x86_64)(?:["?\\]|$)/iu.test(serialized)) return 'game';
    if (/\.(?:pdf|epub|cbz|cbr|mobi)(?:["?\\]|$)/iu.test(serialized)
      || /"(?:format|filetype|extension)"\s*:\s*"(?:pdf|epub|cbz|cbr|mobi)"/iu.test(serialized)) return 'book';
    return null;
  }

  function directProductIdentity(product, index) {
    const nativeId = compactText(product?.machine_name ?? product?.product_key ?? product?.product_id ?? product?.id ?? product?.uuid);
    // Humble does not always expose a product-level ID. The position is a
    // non-title fallback scoped to the immutable purchase identifier.
    return nativeId || `position-${index}`;
  }

  function thirdPartyKeyRecords(detail) {
    const containers = [detail?.tpkd_dict?.all_tpks, detail?.tpkd_dict?.all_tpkds, detail?.all_tpks, detail?.all_tpkds];
    return containers.flatMap((records) => Array.isArray(records) ? records.filter((record) => record && typeof record === 'object') : []);
  }

  function humbleItemsFromOrder(detail, order, purchaseId) {
    const sourceBundle = bundleNameFrom(order, detail);
    const acquiredAt = purchasedAtFrom(order, detail);
    const baseMetadata = { source: 'humble-purchase-library', sourceBundle, purchaseId };
    const products = Array.isArray(detail?.subproducts) ? detail.subproducts : Array.isArray(detail?.products) ? detail.products : [];
    const directItems = (products.length ? products : [detail]).flatMap((product, index) => {
      const title = compactText(product?.human_name ?? product?.product_name ?? product?.title ?? product?.name);
      const mediaType = productKind(product);
      if (!title || !mediaType) return [];
      return [{
        providerItemId: `${purchaseId}:product:${directProductIdentity(product, index)}`,
        title,
        mediaType,
        ownership: 'owned',
        acquiredAt,
        metadata: { ...baseMetadata, entitlement: 'direct-download' }
      }];
    });
    const thirdPartyItems = thirdPartyKeyRecords(detail).flatMap((record, index) => {
      const title = compactText(record?.human_name ?? record?.product_name ?? record?.name);
      if (!title) return [];
      const machineName = compactText(record?.machine_name) || `position-${index}`;
      const keyIndex = Number.isInteger(record?.keyindex) ? record.keyindex : 0;
      return [{
        providerItemId: `${purchaseId}:entitlement:${machineName}:${keyIndex}`,
        title,
        mediaType: 'game',
        ownership: 'owned',
        acquiredAt,
        metadata: { ...baseMetadata, entitlement: 'third-party-key', keyType: compactText(record?.key_type_human_name ?? record?.key_type) }
      }];
    });
    return [...directItems, ...thirdPartyItems];
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function fetchHumblePurchases(reportProgress = () => {}) {
    reportProgress({ purchasesRead: 0, purchasesTotal: 0, items: 0 });
    const response = await fetchJson('/api/v1/user/order?all=true');
    const orders = Array.isArray(response) ? response : response?.data ?? response?.orders;
    if (!Array.isArray(orders)) throw new Error('Humble returned an unexpected purchase list. Please report this page format.');
    const keyedOrders = orders.map((order) => ({ order, purchaseId: orderKey(order) })).filter(({ purchaseId }) => purchaseId);
    if (!keyedOrders.length) throw new Error('Humble returned no readable purchases. Confirm that you are signed in to an account with purchases.');
    const itemsById = new Map();
    const failures = [];
    for (let index = 0; index < keyedOrders.length; index += 1) {
      const { order, purchaseId } = keyedOrders[index];
      reportProgress({ purchasesRead: index, purchasesTotal: keyedOrders.length, items: itemsById.size });
      try {
        const detail = await fetchOrderDetail(purchaseId);
        for (const item of humbleItemsFromOrder(detail, order, purchaseId)) itemsById.set(item.providerItemId, item);
      } catch {
        failures.push(purchaseId);
      }
      reportProgress({ purchasesRead: index + 1, purchasesTotal: keyedOrders.length, items: itemsById.size });
      if (index + 1 < keyedOrders.length) await wait(BETWEEN_PURCHASES_MS);
    }
    // A partial replacement would silently discard previously imported items.
    // Leave the existing Humble provider records intact until a whole scan is
    // readable and can replace them atomically.
    if (failures.length) throw new Error(`${failures.length} Humble purchase${failures.length === 1 ? '' : 's'} could not be read; no library changes were saved. Please try again.`);
    if (!itemsById.size) throw new Error('Humble purchases contained no supported game or book entitlements.');
    return { items: [...itemsById.values()], purchasesRead: keyedOrders.length };
  }

  global.GalacticHumble = { redactRedemptionValues, humbleItemsFromOrder, fetchHumblePurchases };
}(globalThis));
