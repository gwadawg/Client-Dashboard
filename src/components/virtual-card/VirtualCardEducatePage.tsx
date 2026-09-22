import type { VirtualCard } from "@/lib/virtual-card/types";
import { getStylePack, googleFontsHref, packCssVars } from "@/lib/virtual-card/packs";
import { educateStock, type DscrEducateStock, type RmEducateStock } from "@/lib/virtual-card/educate-stock";
import { phoneE164 } from "@/lib/virtual-card/vcard";
import styles from "./VirtualCardEducatePage.module.css";

type Props = {
  card: VirtualCard;
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export default function VirtualCardEducatePage({ card }: Props) {
  const pack = getStylePack(card.product, card.stylePackId);
  const vars = packCssVars(pack);
  const stock = educateStock(card.product);
  const first = firstName(card.fullName);
  const states = card.statesLicensed.join(", ");
  const cardHref = `/card/${card.slug}`;
  const tel = phoneE164(card.phone);
  const loNote =
    card.loNote?.trim() ||
    (stock.product === "rm" ? stock.defaultLoNote : undefined);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={googleFontsHref(pack)} />
      <main
        className={styles.page}
        data-mode={pack.light_or_dark}
        data-product={card.product}
        style={vars as React.CSSProperties}
      >
        <div className={styles.inner}>
          <div className={styles.chrome}>
            <a className={styles.back} href={cardHref}>
              ‹ Back to card
            </a>
            <div className={styles.who}>
              <span>{first}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.headshotUrl} alt="" width={36} height={36} />
            </div>
          </div>

          {stock.product === "rm" ? (
            <RmEducateBody stock={stock} card={card} first={first} loNote={loNote} />
          ) : (
            <DscrEducateBody stock={stock} card={card} first={first} tel={tel} />
          )}

          {card.bookingUrl ? (
            <a
              className={styles.eduBook}
              href={card.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a time with {first} <span className={styles.chev}>→</span>
            </a>
          ) : null}

          <a className={styles.backCard} href={cardHref}>
            ‹ Back to {first}&apos;s card
          </a>

          <p className={styles.footer}>
            {stock.product === "rm"
              ? `This page is for education only and is not financial, tax or legal advice. For questions about taxes or benefits, please speak with a qualified professional. NMLS #${card.nmls}${states ? ` · Licensed in ${states}` : ""}. This is not a commitment to lend. Equal Housing Opportunity.`
              : `NMLS #${card.nmls} · Investment property / business-purpose refinance only · Not a commitment to lend · Not tax or legal advice — talk to your CPA on entity, 1031, or depreciation questions · Equal Housing Opportunity`}
          </p>
        </div>
      </main>
    </>
  );
}

function RmEducateBody({
  stock,
  card,
  first,
  loNote,
}: {
  stock: RmEducateStock;
  card: VirtualCard;
  first: string;
  loNote?: string;
}) {
  return (
    <>
      <p className={styles.eyebrow}>{stock.eyebrow}</p>
      <h1 className={styles.h1}>{stock.h1}</h1>
      <p className={styles.promise}>{stock.promise}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.heroImg} src={stock.heroImage} alt={stock.heroAlt} />

      <h2 className={styles.h2}>What can change</h2>
      <div className={styles.levers}>
        {stock.levers.map(lever => (
          <div key={lever.label} className={styles.lever}>
            <span className={styles.leverLabel}>{lever.label}</span>
            <b>{lever.title}</b>
            <span>{lever.body}</span>
          </div>
        ))}
      </div>

      <h2 className={styles.h2}>{stock.mythsHeading}</h2>
      <div className={styles.myths}>
        {stock.myths.map((myth, i) => (
          <div key={myth.said} className={styles.myth}>
            <span className={styles.mythN}>{i + 1}</span>
            <p className={styles.said}>{myth.said}</p>
            <p className={styles.truth}>{myth.truth}</p>
            <p className={styles.why}>{myth.why}</p>
          </div>
        ))}
      </div>

      <h2 className={styles.h2}>{stock.outcomesHeading}</h2>
      <div className={styles.outcomes}>
        {stock.outcomes.map(o => (
          <article key={o.title} className={styles.outcome}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.image} alt={o.alt} />
            <div className={styles.outcomeBody}>
              <h3>{o.title}</h3>
              <p>{o.body}</p>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.hedge}>{stock.hedge}</p>

      <h2 className={styles.h2}>{stock.stepsHeading}</h2>
      <div className={styles.steps}>
        {stock.steps.map((step, i) => (
          <div key={step.title} className={styles.step} data-n={i + 1}>
            <b>{step.title}</b>
            <span>{step.body}</span>
          </div>
        ))}
      </div>

      {loNote ? (
        <div className={styles.loNote}>
          <div className={styles.loNoteWho}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.headshotUrl} alt="" width={40} height={40} />
            <span>A note from {first}</span>
          </div>
          <p>{loNote}</p>
          <small>
            {card.fullName}, {card.company}
          </small>
        </div>
      ) : null}
    </>
  );
}

function DscrEducateBody({
  stock,
  card,
  first,
  tel,
}: {
  stock: DscrEducateStock;
  card: VirtualCard;
  first: string;
  tel: string;
}) {
  return (
    <>
      <p className={styles.eyebrow}>{stock.eyebrow}</p>
      <h1 className={styles.h1}>
        {stock.h1Lead} <span className={styles.accent}>{stock.h1Accent}</span>
      </h1>
      <p className={styles.promise}>{stock.sub}</p>

      <h2 className={styles.h2}>
        <span className={styles.idx}>01</span> {stock.usecasesHeading}
      </h2>
      <p className={styles.intro}>{stock.usecasesIntro}</p>
      <div className={styles.usecases}>
        {stock.usecases.map((u, i) => (
          <div key={u.tag} className={styles.usecase}>
            <div className={styles.usecaseBody}>
              <div className={styles.tagrow}>
                <span>{u.tag}</span>
                <span className={styles.n}>0{i + 1} / 03</span>
              </div>
              <p className={styles.lead}>{u.lead}</p>
              <p>{u.body}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className={styles.h2}>
        <span className={styles.idx}>02</span> {stock.outcomesHeading}
      </h2>
      <div className={styles.outcomes}>
        {stock.outcomes.map(o => (
          <article key={o.title} className={styles.outcome}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.image} alt={o.alt} />
            <div className={styles.outcomeBody}>
              {o.tag ? <span className={styles.outcomeTag}>{o.tag}</span> : null}
              <h3>{o.title}</h3>
              <p>{o.body}</p>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.hedge}>{stock.hedge}</p>

      <h2 className={styles.h2}>
        <span className={styles.idx}>03</span> {stock.compareHeading}
      </h2>
      <table className={styles.compare}>
        <thead>
          <tr>
            <th>Conventional</th>
            <th>DSCR</th>
          </tr>
        </thead>
        <tbody>
          {stock.compareRows.map(row => (
            <tr key={row.label}>
              <td>
                <span className={styles.rowlabel}>{row.label}</span>
                {row.conventional}
              </td>
              <td>
                <span className={styles.rowlabel}>{row.label}</span>
                {row.dscr}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.compareNote}>{stock.compareNote}</p>

      <h2 className={styles.h2}>
        <span className={styles.idx}>04</span> {stock.readyHeading}
      </h2>
      <ul className={styles.check}>
        {stock.ready.map((item, i) => (
          <li key={item.label}>
            <span className={styles.k}>0{i + 1}</span>
            <span>{item.label}</span>
            <span className={styles.tag}>{item.tag}</span>
          </li>
        ))}
      </ul>

      <div className={styles.straight}>
        <span className={styles.k}>Straight talk</span>
        <b>{stock.straightTalk}</b>
      </div>

      <a className={styles.nextRow} href={`sms:${tel}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.headshotUrl} alt="" width={48} height={48} />
        <span>
          <strong>{stock.textPromptTitle}</strong>
          <span className={styles.copy}>{stock.textPromptBody}</span>
        </span>
      </a>
      <span className={styles.srOnly}>Text {first}</span>
    </>
  );
}
