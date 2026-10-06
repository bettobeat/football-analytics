import { Link } from 'react-router-dom'

const UPDATED = '6 October 2026'
const CONTACT = 'accessibility@bettobeat.com' // the accessibility contact (set up the inbox or change the address)

/** Accessibility statement (Israeli regulations / IS 5568, EU Accessibility Act), in English and Hebrew. */
export default function Accessibility() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
      <section className="space-y-4">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Accessibility statement</h1>
        <p className="text-muted">
          Bet To Beat wants every visitor to be able to use the site, including people with disabilities. We work to the Israeli
          accessibility regulations (Equal Rights for Persons with Disabilities, service accessibility regulations 2013, Israeli
          Standard 5568) and to WCAG 2.1 level AA, which also covers the EU Accessibility Act.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">What the site offers</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-muted">
          <li>An accessibility menu on every page (the blue button at the bottom left): larger text in three steps, high contrast, inverted colours, grayscale, a readable font, highlighted links, more line spacing, stopped animations and a bigger cursor. Your choices are remembered on your device.</li>
          <li>Light and dark mode (the sun / moon button at the top).</li>
          <li>Keyboard use: every link, tab and button can be reached with Tab and activated with Enter or Space; the focused element is clearly outlined; a "Skip to content" link appears on the first Tab press.</li>
          <li>Screen readers: headings on every page, descriptive labels on icon buttons and the search box, images of crests and flags marked as decorative, tables with proper headers, the page language declared.</li>
          <li>Text can be enlarged with the browser's zoom up to 200% without losing content; the site works on phones and tablets.</li>
          <li>No content flashes; animations are short and can be switched off, and the site respects the "reduce motion" setting of your device.</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-ink">Known limitations</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-muted">
          <li>The football pitch view of line-ups is a picture built from player names; the same line-ups are listed as text under it.</li>
          <li>Team crests, player photos and news pictures come from outside data providers and may have no description.</li>
          <li>Video highlights are embedded from YouTube and follow YouTube's accessibility.</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-ink">Contact</h2>
        <p className="text-muted">
          If something on the site is hard to use, or you need information in another form, write to{' '}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-accent">{CONTACT}</a>. Please say which page and what happened; we answer
          within 7 working days. The accessibility coordinator is responsible for this statement.
        </p>
        <p className="text-xs text-faint">Last updated {UPDATED}. We review this statement whenever the site changes significantly, and at least once a year.</p>
      </section>

      <section dir="rtl" lang="he" className="space-y-4 border-t border-line/60 pt-8 text-right">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">הצהרת נגישות</h1>
        <p className="text-muted">
          אנו רואים חשיבות רבה בהנגשת האתר לכלל הציבור, ובכלל זה לאנשים עם מוגבלות. האתר מונגש בהתאם לתקנות שוויון זכויות לאנשים עם
          מוגבלות (התאמות נגישות לשירות), התשע״ג-2013, לתקן ישראלי 5568 ולהנחיות WCAG 2.1 ברמה AA.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">התאמות הנגישות באתר</h2>
        <ul className="list-disc pr-5 space-y-1.5 text-muted">
          <li>תפריט נגישות בכל עמוד (הכפתור הכחול בפינה): הגדלת טקסט בשלוש רמות, ניגודיות גבוהה, היפוך צבעים, גווני אפור, פונט קריא, הדגשת קישורים, ריווח שורות, עצירת אנימציות וסמן גדול. ההגדרות נשמרות במכשיר.</li>
          <li>מצב בהיר ומצב כהה.</li>
          <li>ניווט מלא במקלדת: כל קישור, לשונית וכפתור נגישים באמצעות Tab ומופעלים ב-Enter או ברווח; הרכיב הממוקד מסומן בבירור; קישור "דלג לתוכן" מופיע בלחיצת Tab הראשונה.</li>
          <li>תמיכה בקוראי מסך: כותרות בכל עמוד, תיאורים לכפתורי אייקונים ולתיבת החיפוש, סמלי קבוצות ודגלים מסומנים כדקורטיביים, טבלאות עם כותרות תקינות והצהרת שפת העמוד.</li>
          <li>ניתן להגדיל את התצוגה עד 200% ללא אובדן תוכן; האתר מותאם לטלפונים ולטאבלטים.</li>
          <li>אין תוכן מהבהב; האנימציות קצרות וניתן לכבותן, והאתר מכבד את הגדרת "הפחתת תנועה" של המכשיר.</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-ink">מגבלות ידועות</h2>
        <ul className="list-disc pr-5 space-y-1.5 text-muted">
          <li>תצוגת המגרש של ההרכבים היא תמונה הבנויה משמות השחקנים; אותם הרכבים מופיעים כטקסט מתחתיה.</li>
          <li>סמלי קבוצות, תמונות שחקנים ותמונות חדשות מגיעים מספקי מידע חיצוניים וייתכן שאין להם תיאור.</li>
          <li>סרטוני תקצירים מוטמעים מ-YouTube וכפופים לנגישות של YouTube.</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-ink">פנייה בנושא נגישות</h2>
        <p className="text-muted">
          אם נתקלתם בקושי בשימוש באתר, או שאתם זקוקים למידע בפורמט אחר, כתבו לרכז הנגישות בכתובת{' '}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-accent" dir="ltr">{CONTACT}</a>. אנא ציינו באיזה עמוד מדובר ומה קרה; נשיב
          בתוך 7 ימי עבודה.
        </p>
        <p className="text-xs text-faint">ההצהרה עודכנה לאחרונה ב-{UPDATED}. ההצהרה נבדקת בכל שינוי מהותי באתר ולפחות אחת לשנה.</p>
      </section>

      <p className="text-sm">
        <Link to="/" className="font-semibold text-accent">← Back to the site</Link>
      </p>
    </div>
  )
}
