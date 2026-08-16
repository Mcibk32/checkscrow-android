import React, { useState, useEffect } from 'react';
import { EscrowTransaction, EscrowChatMessage } from '../../types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { escrowService } from '../../services/escrowService';
import { formatRelativeTime } from '../../utils/formatters';
import { Send, Shield, Paperclip, MessageSquare } from 'lucide-react';

export interface EscrowChatViewProps {
  escrow: EscrowTransaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EscrowChatView: React.FC<EscrowChatViewProps> = ({
  escrow,
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<EscrowChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && escrow) {
      fetchMessages();
    }
  }, [isOpen, escrow]);

  const fetchMessages = async () => {
    if (!escrow) return;
    setIsLoading(true);
    const res = await escrowService.getChatMessages(escrow.id);
    if (res.success && res.data) {
      setMessages(res.data);
    } else {
      // Default empty list structure
      setMessages([]);
    }
    setIsLoading(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !escrow) return;

    const newMsg: EscrowChatMessage = {
      id: `msg-${Date.now()}`,
      escrowId: escrow.id,
      senderId: 'current-user',
      senderName: 'You',
      message: inputMsg.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMsg('');

    await escrowService.sendChatMessage(escrow.id, inputMsg.trim());
  };

  if (!escrow) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Escrow Chat: ${escrow.title}`}
      subtitle={`Communicating securely with ${escrow.counterpartyName}`}
      maxWidth="md"
    >
      <div className="flex flex-col h-[420px]">
        {/* Encrypted Notice Banner */}
        <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-[11px] text-emerald-300 flex items-center gap-2 mb-3 shrink-0">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All messages and evidence in this escrow chat are recorded for dispute resolution.</span>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
              <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
              <p>No messages in this escrow conversation yet.</p>
              <p className="text-[11px] text-slate-600 mt-1">Start chatting to coordinate delivery or inspect items.</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.senderName === 'You' || m.senderId === 'current-user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col max-w-[85%] ${isMine ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                >
                  <div
                    className={`p-3 rounded-xl text-xs ${
                      isMine
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    {!isMine && <p className="font-semibold text-[10px] text-emerald-400 mb-0.5">{m.senderName}</p>}
                    <p className="leading-relaxed">{m.message}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">
                    {formatRelativeTime(m.createdAt)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Message Input */}
        <form onSubmit={handleSend} className="pt-3 border-t border-slate-800 flex items-center gap-2 shrink-0">
          <Input
            placeholder="Type your message..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            className="text-xs"
          />
          <Button type="submit" variant="primary" size="md" disabled={!inputMsg.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </Modal>
  );
};
