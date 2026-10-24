import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pickItem, walmartHeaders } from "@/lib/walmart";

describe("walmart", () => {
  it("signs requests the way walmart.io expects", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const h = walmartHeaders("consumer-123", pem, "1", 1700000000000);
    expect(h["WM_CONSUMER.ID"]).toBe("consumer-123");
    expect(h["WM_CONSUMER.INTIMESTAMP"]).toBe("1700000000000");
    expect(h["WM_SEC.KEY_VERSION"]).toBe("1");
    const verify = createVerify("RSA-SHA256");
    verify.update("consumer-123\n1700000000000\n1\n");
    expect(verify.verify(publicKey, h["WM_SEC.AUTH_SIGNATURE"], "base64")).toBe(true);
  });

  it("picks the first item in stock", () => {
    expect(
      pickItem({
        items: [
          { itemId: 1, name: "Sold out sour cream", stock: "Not available" },
          { itemId: 10450114, name: "Great Value Sour Cream, 16 oz", salePrice: 1.98, stock: "Available" },
        ],
      }),
    ).toEqual({ itemId: "10450114", name: "Great Value Sour Cream, 16 oz", price: 1.98 });
    expect(pickItem({})).toBeNull();
  });
});
