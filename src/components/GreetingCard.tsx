import React from "react";

interface Props {
  greeting: string;
}

export default function GreetingCard({ greeting }: Props) {
  return (
    <div className="greeting-card">
      <h1>{greeting}</h1>
      <style>{`
        .greeting-card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .greeting-card h1 {
          font-size: 28px;
          font-weight: 600;
          background: linear-gradient(135deg, #4fc3f7 0%, #e1bee7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>
    </div>
  );
}
