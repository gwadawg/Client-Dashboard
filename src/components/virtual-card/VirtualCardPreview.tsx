import type { VirtualCard } from "@/lib/virtual-card/types";
import { getStylePack, packCssVars } from "@/lib/virtual-card/packs";
import { formatPhoneDisplay, phoneE164 } from "@/lib/virtual-card/vcard";
import styles from "./VirtualCardPage.module.css";

/** Compact mobile preview for the Card wizard (no Google Fonts load). */
export default function VirtualCardPreview({ card }: { card: VirtualCard }) {
  const pack = getStylePack(card.product, card.stylePackId);
  const vars = packCssVars(pack);
  const tel = phoneE164(card.phone);
  const showBook = !!card.bookingUrl;

  return (
    <div
      className={styles.page}
      data-mode={pack.light_or_dark}
      style={{
        ...(vars as React.CSSProperties),
        minHeight: "auto",
        borderRadius: 16,
        overflow: "hidden",
        maxWidth: 320,
        margin: "0 auto",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className={styles.inner} style={{ padding: "1.25rem 1rem 1.5rem" }}>
        <p className={styles.brand} style={{ animation: "none", opacity: 1 }}>
          {card.company || "Company"}
        </p>
        <div className={styles.hero} style={{ animation: "none", opacity: 1 }}>
          <div className={styles.photoWrap} style={{ width: 88, height: 88 }}>
            {card.headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.photo} src={card.headshotUrl} alt="" />
            ) : (
              <div className={styles.photo} style={{ background: "var(--vc-paper-deep)" }} />
            )}
          </div>
          <h1 className={styles.name} style={{ fontSize: "1.35rem" }}>
            {card.fullName || "Full name"}
          </h1>
          <p className={styles.role}>{card.title || "Loan Officer"}</p>
          <p className={styles.value} style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
            {card.valueLine || "Value line preview"}
          </p>
        </div>
        <div className={styles.ctaRow} style={{ animation: "none", opacity: 1, marginBottom: "0.75rem" }}>
          <span className={styles.ctaPrimary}>Call</span>
          <span className={styles.ctaSecondary}>Text</span>
          <span className={styles.ctaSecondary}>Save</span>
          {showBook ? <span className={styles.ctaBook}>{card.bookingLabel || "Book a call"}</span> : null}
        </div>
        <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--vc-faint)", textAlign: "center" }}>
          {formatPhoneDisplay(card.phone || "0000000000")} · NMLS #{card.nmls || "—"}
          {tel ? "" : ""}
        </p>
      </div>
    </div>
  );
}
