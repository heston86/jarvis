import React, { useRef, useEffect, useState } from "react";

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "followup";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Props {
  conversation: Message[];
  onSendMessage: (message: string) => void;
  voiceState: VoiceState;
}

export default function ConversationPanel({
  conversation,
  onSendMessage,
  voiceState,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue("");
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="panel conversation-panel">
      <div className="panel-header">
        <span className="panel-title">Conversation</span>
        <div className="panel-actions">
          <button className="action-btn" title="Clear">🗑</button>
          <button className="action-btn" title="Export">📤</button>
        </div>
      </div>

      <div className="messages" ref={scrollRef}>
        {conversation.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
            <div className="message-time">{formatTime(msg.timestamp)}</div>
          </div>
        ))}

        {voiceState === "thinking" && (
          <div className="message assistant thinking">
            <div className="thinking-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {voiceState === "listening" && (
          <div className="message user listening">
            <div className="listening-indicator">
              <div className="wave"></div>
              <div className="wave"></div>
              <div className="wave"></div>
              <div className="wave"></div>
              <div className="wave"></div>
            </div>
            <span>Listening...</span>
          </div>
        )}
      </div>

      <form className="message-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={voiceState !== "idle"}
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!inputValue.trim() || voiceState !== "idle"}
        >
          ➤
        </button>
      </form>
    </div>
  );
}
