import { Link } from 'react-router';

// A plain-language data-handling page. TeachSpark runs on WhatsApp and carries classroom material,
// so teachers deserve a straight answer about their own data — not just "no student data." Kept
// honest and specific to what the product actually stores (see the bot's help copy + signup schema).
export function Privacy() {
  return (
    <main className="legal">
      <h1>Your data on TeachSpark</h1>
      <p className="legal__lead">
        Plain and short. TeachSpark is a free pilot run by one person, built for teachers. Here is
        exactly what it keeps, why, and how to remove it.
      </p>

      <h2>What it stores</h2>
      <ul>
        <li>Your <strong>WhatsApp number</strong>, so it can reply to you.</li>
        <li>Your <strong>grade, subject and board</strong>, so it doesn't ask again every time.</li>
        <li>The <strong>topics you ask for</strong> and the worksheets, quizzes and papers it makes for you.</li>
        <li>If you use the sign-up page: your <strong>name, profession and city</strong> — nothing more.</li>
      </ul>

      <h2>What it never asks for</h2>
      <p><strong>No student data, ever.</strong> Please don't send any — names, marks, photos of students. TeachSpark only needs your class details and your topic.</p>

      <h2>Why it keeps this</h2>
      <p>Only to make your worksheets, remember your class so the chat stays quick, and understand how the pilot is going. Your data is <strong>never sold</strong> and never used for advertising.</p>

      <h2>Where it lives</h2>
      <p>Securely in a standard managed database (Supabase). It is not shared with other teachers or third parties for their own use.</p>

      <h2>Your control</h2>
      <ul>
        <li>Send <strong>CLEAR</strong> in the chat to reset your current session, or <strong>RESTART</strong> to start over.</li>
        <li>Message TeachSpark and ask to be removed — your record is deleted.</li>
        <li>You can leave anytime. Nothing keeps messaging you once you stop.</li>
      </ul>

      <p className="legal__foot">
        Questions, or want your data removed? Just message TeachSpark on WhatsApp. <Link to="/join">Back to the pilot →</Link>
      </p>
    </main>
  );
}
