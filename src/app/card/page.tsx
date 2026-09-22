import type { Metadata } from "next";
import styles from "./card-home.module.css";

export const metadata: Metadata = {
  title: "Loan Officer card",
  description: "Open your loan officer’s personal link to save their contact and get in touch.",
  robots: { index: false, follow: false },
};

/** Stub for loanofficer.me/ — not a directory of clients. */
export default function CardHomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>loanofficer.me</p>
        <h1 className={styles.title}>Card not found</h1>
        <p className={styles.body}>
          Ask your loan officer for their personal link — it looks like{" "}
          <span className={styles.mono}>loanofficer.me/their-name</span>.
        </p>
      </div>
    </main>
  );
}
