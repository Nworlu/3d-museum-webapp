/** DOM-overlay info panel shown when the visitor clicks an exhibit. */
export class InspectPanel {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly descEl: HTMLParagraphElement;
  private onCloseCallback: (() => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "inspect-panel";
    Object.assign(this.root.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      maxWidth: "320px",
      padding: "16px 18px",
      background: "rgba(20,20,20,0.88)",
      color: "#fff",
      fontFamily: "system-ui, sans-serif",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    this.titleEl = document.createElement("h2");
    this.titleEl.style.margin = "0 0 8px 0";
    this.titleEl.style.fontSize = "16px";

    this.descEl = document.createElement("p");
    this.descEl.style.margin = "0 0 12px 0";
    this.descEl.style.fontSize = "13px";
    this.descEl.style.lineHeight = "1.4";
    this.descEl.style.opacity = "0.85";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close (Esc)";
    Object.assign(closeBtn.style, {
      background: "rgba(255,255,255,0.12)",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      padding: "6px 12px",
      cursor: "pointer",
      fontSize: "12px",
    } satisfies Partial<CSSStyleDeclaration>);
    closeBtn.addEventListener("click", () => this.close());

    this.root.append(this.titleEl, this.descEl, closeBtn);
    document.body.appendChild(this.root);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  open(title: string, description: string, onClose: () => void): void {
    this.titleEl.textContent = title;
    this.descEl.textContent = description;
    this.root.style.display = "block";
    this.onCloseCallback = onClose;
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.style.display = "none";
    const cb = this.onCloseCallback;
    this.onCloseCallback = null;
    cb?.();
  }
}
