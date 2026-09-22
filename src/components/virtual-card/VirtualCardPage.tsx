import type { VirtualCard } from "@/lib/virtual-card/types";
import { formatPhoneDisplay, phoneE164 } from "@/lib/virtual-card/vcard";
import { getStylePack, googleFontsHref, packCssVars } from "@/lib/virtual-card/packs";
import { secondaryLearnLabel } from "@/lib/virtual-card/educate-stock";
import styles from "./VirtualCardPage.module.css";

type Props = {
  card: VirtualCard;
};

export default function VirtualCardPage({ card }: Props) {
  const tel = phoneE164(card.phone);
  const pack = getStylePack(card.product, card.stylePackId);
  const vars = packCssVars(pack);
  const states = card.statesLicensed.join(", ");
  const vcardHref = `/card/${card.slug}/vcard`;
  /** App route; loanofficer.me/{slug}/learn rewrites here via middleware. */
  const learnHref = `/card/${card.slug}/learn`;
  const learnLabel =
    card.secondaryLinks?.[0]?.label ?? secondaryLearnLabel(card.product);
  const showBook = !!card.bookingUrl;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={googleFontsHref(pack)} />
      <main
        className={styles.page}
        data-mode={pack.light_or_dark}
        style={vars as React.CSSProperties}
      >
        <div className={styles.inner}>
          <p className={styles.brand}>{card.company}</p>

          <div className={styles.hero}>
            <div className={styles.photoWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.photo}
                src={card.headshotUrl}
                alt={card.fullName}
                width={160}
                height={160}
              />
            </div>

            <h1 className={styles.name}>{card.fullName}</h1>
            <p className={styles.role}>{card.title}</p>
            <p className={styles.value}>{card.valueLine}</p>
          </div>

          <div className={styles.ctaRow} role="group" aria-label="Contact actions">
            <a className={styles.ctaPrimary} href={`tel:${tel}`}>
              Call
            </a>
            <a className={styles.ctaSecondary} href={`sms:${tel}`}>
              Text
            </a>
            <a className={styles.ctaSecondary} href={vcardHref} download={`${card.slug}.vcf`}>
              Save contact
            </a>
            {showBook ? (
              <a
                className={styles.ctaBook}
                href={card.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {card.bookingLabel || "Book a call"}
              </a>
            ) : null}
          </div>

          <section className={styles.details} aria-label="License and contact">
            <dl className={styles.dl}>
              <div className={styles.row}>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${tel}`}>{formatPhoneDisplay(card.phone)}</a>
                </dd>
              </div>
              <div className={styles.row}>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${card.email}`}>{card.email}</a>
                </dd>
              </div>
              <div className={styles.row}>
                <dt>NMLS</dt>
                <dd>{card.nmls}</dd>
              </div>
              {states ? (
                <div className={styles.row}>
                  <dt>Licensed</dt>
                  <dd>{states}</dd>
                </div>
              ) : null}
            </dl>

            <a className={styles.learnLink} href={learnHref}>
              <span className={styles.learnText}>
                <span className={styles.learnLabel}>{learnLabel}</span>
                <span className={styles.learnSub}>Opens a short guide →</span>
              </span>
              <span className={styles.learnArrow} aria-hidden="true">
                →
              </span>
            </a>
          </section>

          <p className={styles.disclaimer}>
            NMLS #{card.nmls}
            {states ? ` · Licensed in ${states}` : ""}. This is not a commitment to lend.
            Equal Housing Opportunity.
          </p>
        </div>
      </main>
    </>
  );
}
