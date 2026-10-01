import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>There is no page here</h1>
        <p>
          The address may have a typo. <Link to="/">Go to Analyze</Link> to test a tweet.
        </p>
      </header>
    </div>
  );
}
