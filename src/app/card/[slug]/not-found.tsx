import type { Metadata } from "next";
import styles from "../card-home.module.css";

export const metadata: Metadata = {
  title: "Card not found",
  robots: { index: false, follow: false },
};

export default function CardNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>loanofficer.me</p>
        <h1 className={styles.title}>Card not found</h1>
        <p className={styles.body}>
          That link doesn&apos;t match a loan officer card. Double-check the URL or ask them to
          resend their link.
        </p>
      </div>
    </main>
  );
}
