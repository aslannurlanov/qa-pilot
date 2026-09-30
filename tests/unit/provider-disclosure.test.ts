import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoNotice } from "@/components/ui/demo-notice";

describe("provider disclosure", () => {
  it("discloses the fake fixture", () => {
    expect(renderToStaticMarkup(createElement(DemoNotice, { provider: "fake" }))).toContain("Демонстрационный режим.");
  });
  it("discloses AI review without claiming fixture generation", () => {
    const html = renderToStaticMarkup(createElement(DemoNotice, { provider: "openai" }));
    expect(html).toContain("на основе названия и описания задачи");
    expect(html).not.toContain("имени пользователя");
  });
});
