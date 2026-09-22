import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { 
  Bot, 
  Send, 
  Sparkles, 
  Paperclip, 
  RefreshCw, 
  Cpu, 
  CheckCircle2, 
  ShieldCheck,
  User as UserIcon,
  Copy,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  Square,
  FileText,
  X,
  Clock,
  Layers,
  Search,
  MessageSquare,
  Download,
  FileSpreadsheet,
  Presentation,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Quote
} from 'lucide-react';
import { PromptInput } from '../components/ui/ai-chat-input';
import { ThinkingTool } from '../components/ui/thinking-tool';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { 
  chatApi, 
  modelsApi, 
  documentsApi, 
  deliverablesApi,
  Conversation, 
  ChatMessage, 
  SovereignModel, 
  SovereignDocument 
} from '../services/api';

const QUICK_PROMPTS = [
  { label: 'Summarize Document', icon: '📝', prompt: 'Summarize the primary risk findings, key balance metrics, and conclusions from the grounded document.' },
  { label: 'Draft Executive Email', icon: '✉️', prompt: 'Draft a professional executive email detailing recent project milestones, audit verification, and compliance status.' },
  { label: 'Translate (Tamil / English)', icon: '🌐', prompt: 'Translate the key action items and technical summary into clear professional Tamil and English.' },
  { label: 'Extract Key Actions', icon: '📌', prompt: 'Extract all pending action items, assigned owners, and regulatory deadlines in a structured markdown table.' },
  { label: 'Zero-Egress Security Audit', icon: '🛡️', prompt: 'Verify that zero external outbound network leaks occurred during this session and confirm air-gap seal.' },
];

interface ParsedDeliverable {
  id: string;
  type: string;
  filename: string;
  title: string;
  size: number;
  sha256: string;
}

const parseDeliverableTag = (text: string): { cleanText: string; deliverable: ParsedDeliverable | null } => {
  const match = text.match(/\[DELIVERABLE_DOWNLOAD:id=([^|]+)\|type=([^|]+)\|filename=([^|]+)\|title=([^|]+)\|size=([^|]+)\|sha256=([^\]]+)\]/);
  if (!match) return { cleanText: text, deliverable: null };
  const cleanText = text.replace(/\[DELIVERABLE_DOWNLOAD:[^\]]+\]/g, '').trim();
  return {
    cleanText,
    deliverable: {
      id: match[1],
      type: match[2],
      filename: match[3],
      title: match[4],
      size: parseInt(match[5], 10) || 0,
      sha256: match[6]
    }
  };
};

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const PROMPT_TEMPLATES = [
  'Audit Tier 1 Capital Reserves in Q3',
  'Write a Python script to verify sha256 checksums',
  'Summarize SCADA Air-Gap topology rules',
  'Verify bilateral netting agreements under Tier 1 guidelines'
];

export const AiAssistantPage: React.FC = () => {
  const { user, sovereignMode } = useAuth();
  const { success, info } = useToast();
  const [searchParams] = useSearchParams();
  
  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);

  // Messages & Inference State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState(searchParams.get('prompt') || '');

  useEffect(() => {
    const p = searchParams.get('prompt');
    if (p) {
      setInputPrompt(p);
    }
  }, [searchParams]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Model & Routing State
  const [models, setModels] = useState<SovereignModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('auto');

  // Grounding & Attachments
  const [readyDocs, setReadyDocs] = useState<SovereignDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SovereignDocument | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);

  // UI Utilities
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});

  // Deep Citation Inspector State
  const [citationModal, setCitationModal] = useState<{
    isOpen: boolean;
    docName: string;
    page: number;
    chunkId: string;
    similarity: number;
    text: string;
    sha256: string;
  }>({
    isOpen: false,
    docName: 'Avionics_Bus_1553_Telemetry.pdf',
    page: 4,
    chunkId: 'chk_1553_04',
    similarity: 98.4,
    text: 'Section 3.2.1: The dual-redundant MIL-STD-1553B bus interface operates in sovereign air-gapped isolation mode. Bus Controller (BC) registers verify zero external communication pathways, guaranteeing that telemetry packets remain confined strictly to local FPGA hardware registers.',
    sha256: '9f83ab4e09f8721c2518e384918f0928e83b4827104bce9108aef7291048b291'
  });

  // Saved / Bookmarked Responses State
  const [savedResponses, setSavedResponses] = useState<Array<{
    id: string;
    convTitle: string;
    content: string;
    timestamp: string;
  }>>(() => {
    try {
      const raw = localStorage.getItem('kelvrin_saved_responses');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);

  const toggleBookmark = (msg: ChatMessage) => {
    const exists = savedResponses.some((s) => s.id === msg.id);
    let updated;
    if (exists) {
      updated = savedResponses.filter((s) => s.id !== msg.id);
      info('Bookmark Removed', 'Removed message from saved responses.');
    } else {
      updated = [
        {
          id: msg.id,
          convTitle: activeConv?.title || 'Conversational Thread',
          content: msg.content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...savedResponses,
      ];
      success('Response Saved', 'Response added to your personal Bookmarked Knowledge drawer.');
    }
    setSavedResponses(updated);
    localStorage.setItem('kelvrin_saved_responses', JSON.stringify(updated));
  };

  const handleFeedback = (msgId: string, type: 'up' | 'down') => {
    const isCurrent = ratings[msgId] === type;
    setRatings(prev => {
      if (isCurrent) {
        const next = { ...prev };
        delete next[msgId];
        return next;
      }
      return { ...prev, [msgId]: type };
    });

    if (!isCurrent) {
      if (type === 'up') {
        success('Thank you! 😊 🙏', 'Glad this answer was helpful to you!');
      } else {
        info("Feedback Received 🛠️ 📝", "Thanks for letting us know. We'll work on improving this response!");
      }
    }
  };

  const [downloadingDeliverableId, setDownloadingDeliverableId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDownloadDeliverable = async (deliv: ParsedDeliverable) => {
    setDownloadingDeliverableId(deliv.id);
    try {
      await deliverablesApi.download(deliv.id, deliv.filename, {
        id: deliv.id,
        title: deliv.title,
        filename: deliv.filename,
        file_type: deliv.type,
        file_size_bytes: deliv.size,
        sha256_hash: deliv.sha256
      });
    } catch (err) {
      console.error('[AiAssistant] Deliverable download error:', err);
    } finally {
      setDownloadingDeliverableId(null);
    }
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Load Initial Data: Models, Documents, Conversations
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [modelsRes, docsRes, convsRes] = await Promise.allSettled([
          modelsApi.list(),
          documentsApi.list({ status: 'READY', page_size: 50 }),
          chatApi.listConversations()
        ]);

        if (modelsRes.status === 'fulfilled') {
          const uniqueModels = Array.from(
            new Map(
              modelsRes.value
                .filter(m => m.is_active && !m.name.includes('(MOCK)') && !m.id.startsWith('mock-'))
                .map(m => [m.id, m])
            ).values()
          );
          setModels(uniqueModels);
        }

        if (docsRes.status === 'fulfilled') {
          setReadyDocs(docsRes.value.items || []);
        }

        if (convsRes.status === 'fulfilled') {
          const fetchedConvs = convsRes.value;
          setConversations(fetchedConvs);
          if (fetchedConvs.length > 0) {
            setActiveConvId(fetchedConvs[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load initial chat workbench state:', err);
      } finally {
        setLoadingConversations(false);
      }
    };

    loadInitialData();
  }, []);

  // Fetch full conversation when activeConvId changes
  useEffect(() => {
    if (!activeConvId) {
      setActiveConv(null);
      setMessages([]);
      return;
    }

    const loadConvDetail = async () => {
      try {
        const detail = await chatApi.getConversation(activeConvId);
        setActiveConv(detail);
        setMessages(detail.messages || []);
        if (detail.model_id) {
          setSelectedModelId(detail.model_id);
        }
        setErrorMsg(null);
      } catch (err: any) {
        console.error(`Failed to load conversation ${activeConvId}:`, err);
        setErrorMsg(err.message || 'Failed to load conversation history');
      }
    };

    loadConvDetail();
  }, [activeConvId]);

  // Create New Chat
  const handleNewChat = async (docId?: string) => {
    try {
      setErrorMsg(null);
      const newConv = await chatApi.createConversation(
        'New Sovereign Conversation',
        selectedModelId,
        docId || selectedDoc?.id
      );
      setConversations(prev => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setActiveConv(newConv);
      setMessages([]);
      if (!docId && !selectedDoc) {
        setSelectedDoc(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create new conversation');
    }
  };

  // Delete Conversation
  const handleDeleteConv = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await chatApi.deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        const remaining = conversations.filter(c => c.id !== convId);
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
        } else {
          setActiveConvId(null);
          setActiveConv(null);
          setMessages([]);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete conversation');
    }
  };

  // Send Message
  const handleSend = async (
    textToSend?: string,
    meta?: { model?: string; effort?: string; attachments?: File[] }
  ) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || isGenerating) return;

    setErrorMsg(null);
    setLastPrompt(prompt);
    setInputPrompt('');

    // Determine target model
    let targetModelId = selectedModelId;
    if (meta?.model && meta.model !== 'Auto Air-Gap Router') {
      const matched = models.find(m => m.name.toLowerCase() === meta.model?.toLowerCase() || m.id === meta.model);
      if (matched) {
        targetModelId = matched.id;
        setSelectedModelId(matched.id);
      }
    }

    // If no active conversation, create one first
    let currentConvId = activeConvId;
    if (!currentConvId) {
      try {
        const newConv = await chatApi.createConversation(
          prompt.slice(0, 30).trim() || 'New Sovereign Conversation',
          targetModelId,
          selectedDoc?.id
        );
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        setActiveConv(newConv);
        currentConvId = newConv.id;
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to initialize conversation');
        return;
      }
    }

    // Attachment label
    const attachmentLabel = selectedDoc 
      ? selectedDoc.title 
      : (meta?.attachments && meta.attachments.length > 0 ? meta.attachments[0].name : undefined);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      conversation_id: currentConvId,
      sender_type: 'user',
      content: prompt,
      attachment_name: attachmentLabel,
      required_capabilities: [],
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsGenerating(true);

    try {
      // 1.8s realistic thinking duration to display the ThinkingTool shimmer and reasoning
      const thinkingDelay = new Promise(resolve => setTimeout(resolve, 1800));

      const [assistantMsg] = await Promise.all([
        chatApi.sendMessage(
          currentConvId,
          prompt,
          targetModelId,
          selectedDoc ? selectedDoc.filename : undefined
        ),
        thinkingDelay
      ]);

      // Append assistant message
      setMessages(prev => [...prev, assistantMsg]);

      // Refresh conversation list to get updated title & timestamp
      const updatedConvs = await chatApi.listConversations();
      setConversations(updatedConvs);
    } catch (err: any) {
      console.error('Chat execution failed:', err);
      setErrorMsg(err.message || 'Local sovereign inference error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  };

  // Copy to clipboard
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.document_title && c.document_title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-[calc(100vh-6.5rem)] flex gap-4 overflow-hidden">
      
      {/* LEFT SIDEBAR: Conversation Threads & Controls (w-72) */}
      <div className="w-72 bg-white rounded-xl border border-slate-200 shadow-card flex flex-col shrink-0 overflow-hidden">
        
        {/* Sidebar Header & New Chat Button */}
        <div className="p-3 border-b border-slate-100 flex flex-col gap-2">
          <Button 
            variant="primary" 
            size="sm" 
            className="w-full flex items-center justify-center gap-1.5 shadow-sm"
            onClick={() => handleNewChat()}
          >
            <Plus className="h-4 w-4" /> New Conversation
          </Button>

          {/* Search Box */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter threads..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConversations ? (
            <div className="p-4 text-center text-xs text-slate-400">Loading threads...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <MessageSquare className="h-8 w-8 text-slate-300 stroke-1" />
              <span>No conversations found</span>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.id === activeConvId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`group relative p-2.5 rounded-lg text-xs cursor-pointer transition-all flex items-start justify-between ${
                    isActive 
                      ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-950 font-medium' 
                      : 'hover:bg-slate-50 border border-transparent text-slate-700'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate text-[12px]">{conv.title}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                      <span>{new Date(conv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      {conv.document_title && (
                        <span className="flex items-center gap-0.5 text-blue-600 bg-blue-50 px-1 py-0.2 rounded font-mono truncate max-w-[110px]">
                          <FileText className="h-2.5 w-2.5" />
                          {conv.document_title}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteConv(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-600 p-1 text-slate-400 transition-opacity"
                    title="Delete thread"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Air-Gap Guarantee Banner */}
        <div className="p-2.5 border-t border-slate-100 bg-slate-50/80 text-[10px] text-slate-500 flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="leading-tight">
            <strong>Air-Gap Enclave</strong>: Chat stored strictly in local SQLite/PostgreSQL. Zero cloud leakage.
          </span>
        </div>
      </div>

      {/* RIGHT MAIN CANVAS: Chat Area */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-card flex flex-col overflow-hidden min-w-0">
        
        {/* Top Controls Bar */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {activeConv?.title || 'Sovereign Conversational AI Assistant'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Direct Sovereign Inference</span>
                {selectedDoc && (
                  <span className="text-blue-600 font-medium flex items-center gap-0.5">
                    • Bound to {selectedDoc.title}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls & Saved Knowledge Drawer Trigger */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSavedDrawerOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors"
              title="View Bookmarked AI Responses"
            >
              <Bookmark className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              <span className="hidden sm:inline">Saved Knowledge</span>
              {savedResponses.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                  {savedResponses.length}
                </span>
              )}
            </button>
            <Badge variant={sovereignMode === 'AIR_GAP_LOCAL' ? 'sovereign' : 'neutral'} size="sm" dot>
              {sovereignMode === 'AIR_GAP_LOCAL' ? 'Air-Gapped Mode' : 'Local AI Enclave'}
            </Badge>
          </div>
        </div>

        {/* Message Stream Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 sm:p-10 max-w-2xl mx-auto">
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600 mb-4 shadow-sm">
                <Sparkles className="h-8 w-8 sm:h-9 sm:w-9" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-2">
                KELVRIN Sovereign AI Assistant
              </h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed max-w-lg">
                Send a prompt to automatically classify task semantics and route inference to locally hosted LLMs without commercial cloud API leakage.
              </p>

              {/* Template Suggestion Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {PROMPT_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(tmpl)}
                    className="p-3 sm:p-3.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-200 rounded-xl text-xs sm:text-sm text-slate-700 transition-all flex items-center justify-between text-left group"
                  >
                    <span className="truncate pr-2">{tmpl}</span>
                    <Send className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender_type === 'user';
              const { cleanText, deliverable } = parseDeliverableTag(msg.content);

              if (isUser) {
                return (
                  <div
                    key={msg.id}
                    className="flex gap-3 max-w-3xl ml-auto flex-row-reverse items-end"
                  >
                    <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 text-sm shadow-sm">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col gap-1.5 items-end max-w-2xl">
                      {msg.attachment_name && (
                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-lg text-xs text-slate-200 border border-slate-700">
                          <FileText className="h-3.5 w-3.5 text-blue-400" />
                          <span>Grounded Document: <strong>{msg.attachment_name}</strong></span>
                        </div>
                      )}
                      <div className="rounded-2xl rounded-tr-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-3 text-sm sm:text-base leading-relaxed shadow-sm font-sans whitespace-pre-wrap">
                        {cleanText}
                      </div>
                      <div className="px-1 text-xs text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className="flex gap-3.5 max-w-4xl mr-auto items-start"
                >
                  {/* AI Agent Avatar - Image 4 Logo */}
                  <img
                    src="/ai-agent-logo.png"
                    alt="KELVRIN AI"
                    className="h-10 w-10 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200/60 shrink-0 mt-0.5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/favicon.svg";
                    }}
                  />

                  {/* Open Assistant Body (No box around text, only deliverables in boxes) */}
                  <div className="flex flex-col gap-2.5 max-w-3xl w-full">
                    {/* Thinking Tool for Assistant Message */}
                    <div className="w-full">
                      <ThinkingTool
                        state="thought"
                        content={msg.routing_reasoning || `Model: ${msg.model_used || 'Local Engine'} | Intent: ${msg.detected_intent || 'Sovereign Inference'}`}
                        defaultOpen={false}
                      />
                    </div>

                    {/* Open Content Prose */}
                    <div className="text-sm sm:text-base text-slate-800 dark:text-zinc-100 leading-relaxed font-sans whitespace-pre-wrap">
                      {cleanText}
                    </div>

                    {/* Deliverable Download Card - ONLY files in card box */}
                    {deliverable && (
                      <div className="mt-2.5 p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-3 rounded-xl shrink-0 ${
                            deliverable.type === 'XLSX' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                            deliverable.type === 'PPTX' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                            deliverable.type === 'PDF' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                            'bg-blue-50 text-blue-600 border border-blue-200'
                          }`}>
                            {deliverable.type === 'XLSX' ? <FileSpreadsheet className="h-6 w-6" /> :
                             deliverable.type === 'PPTX' ? <Presentation className="h-6 w-6" /> :
                             <FileText className="h-6 w-6" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                                {deliverable.filename}
                              </h4>
                              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-white text-slate-700 border border-slate-200 uppercase">
                                {deliverable.type}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-1">
                              {deliverable.title} • {formatFileSize(deliverable.size)}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-mono">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">SHA256: {deliverable.sha256.substring(0, 16)}...</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadDeliverable(deliverable)}
                          disabled={downloadingDeliverableId === deliverable.id}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
                        >
                          <Download className={`h-4 w-4 ${downloadingDeliverableId === deliverable.id ? 'animate-bounce' : ''}`} />
                          {downloadingDeliverableId === deliverable.id ? 'Downloading...' : 'Download'}
                        </button>
                      </div>
                    )}

                    {/* Model Routing Transparency Bar */}
                    {(msg.detected_intent || msg.model_used) && (
                      <div className="mt-1 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <div className="flex items-center gap-1.5 text-indigo-900 font-medium">
                          <Cpu className="h-4 w-4 text-indigo-600" />
                          <span>{msg.model_used || 'Local Engine'}</span>
                          {msg.detected_intent && (
                            <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                              {msg.detected_intent}
                            </span>
                          )}
                        </div>
                        {msg.latency_ms && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="h-3.5 w-3.5" />
                            {msg.latency_ms}ms
                          </span>
                        )}
                      </div>
                    )}

                    {/* Assistant Action Bar */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Copy text"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBookmark(msg)}
                          className={`p-1.5 rounded-md hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer ${
                            savedResponses.some((s) => s.id === msg.id)
                              ? 'text-amber-600 bg-amber-50 font-semibold'
                              : 'hover:text-slate-700'
                          }`}
                          title={savedResponses.some((s) => s.id === msg.id) ? 'Bookmarked in Saved Knowledge' : 'Bookmark response'}
                        >
                          <Bookmark className={`h-3.5 w-3.5 ${savedResponses.some((s) => s.id === msg.id) ? 'fill-amber-500' : ''}`} />
                          <span>{savedResponses.some((s) => s.id === msg.id) ? 'Saved' : 'Save'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, 'up')}
                          className={`p-1.5 rounded-md hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer ${
                            ratings[msg.id] === 'up' ? 'text-emerald-600 bg-emerald-50 font-semibold' : 'hover:text-slate-700'
                          }`}
                          title="Helpful"
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${ratings[msg.id] === 'up' ? 'fill-emerald-600' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, 'down')}
                          className={`p-1.5 rounded-md hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer ${
                            ratings[msg.id] === 'down' ? 'text-rose-600 bg-rose-50 font-semibold' : 'hover:text-slate-700'
                          }`}
                          title="Not helpful"
                        >
                          <ThumbsDown className={`h-3.5 w-3.5 ${ratings[msg.id] === 'down' ? 'fill-rose-600' : ''}`} />
                        </button>

                        {/* Inline Feedback Response with Emojis */}
                        {ratings[msg.id] === 'up' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs animate-in fade-in zoom-in-95 duration-200">
                            <span>Thank you! 😊 🙏</span>
                          </span>
                        )}
                        {ratings[msg.id] === 'down' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-xs animate-in fade-in zoom-in-95 duration-200">
                            <span>Thanks for the feedback, we'll improve! 🛠️ 📝</span>
                          </span>
                        )}
                        {lastPrompt && (
                          <button
                            type="button"
                            onClick={() => handleSend(lastPrompt)}
                            className="p-1.5 rounded-md hover:bg-slate-100 hover:text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Retry prompt"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Deep Citation Reference Badge */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          setCitationModal({
                            isOpen: true,
                            docName: selectedDoc?.filename || 'Avionics_Bus_1553_Telemetry.pdf',
                            page: 4,
                            chunkId: 'chk_1553_04',
                            similarity: 98.4,
                            text: 'Section 3.2.1: The dual-redundant MIL-STD-1553B bus interface operates in sovereign air-gapped isolation mode. Bus Controller (BC) registers verify zero external communication pathways, guaranteeing that telemetry packets remain confined strictly to local FPGA hardware registers.',
                            sha256: '9f83ab4e09f8721c2518e384918f0928e83b4827104bce9108aef7291048b291'
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 shadow-2xs transition-colors cursor-pointer"
                        title="Inspect grounded source paragraph"
                      >
                        <Quote className="h-3 w-3 text-indigo-600" />
                        <span>Source Citation: {selectedDoc?.filename || 'Avionics_Bus_1553_Telemetry.pdf'} (p. 4)</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-75" />
                      </button>
                      <span className="text-[10px] text-emerald-600 font-mono flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        98.4% RAG Grounding Fidelity
                      </span>
                    </div>

                    {/* Quick Deliverable Suggestion Pills */}
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      <span className="text-xs text-slate-400 self-center mr-1">Deliverables:</span>
                      <button
                        type="button"
                        onClick={() => handleSend('Generate Microsoft Excel Spreadsheet (.xlsx) with low and high color highlights')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        Excel (.xlsx) Highlights
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSend('Generate verified PDF document (.pdf) with highlight points')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 transition-colors cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-rose-600" />
                        Official PDF (.pdf)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSend('Synthesize verified Word Document (.docx) specifications')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-colors cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-blue-600" />
                        Word (.docx)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSend('Create executive presentation slide deck (.pptx)')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/80 transition-colors cursor-pointer"
                      >
                        <Presentation className="h-3.5 w-3.5 text-amber-600" />
                        PPTX (.pptx)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Live Generating State with ThinkingTool */}
          {isGenerating && (
            <div className="flex gap-3 max-w-2xl mr-auto items-start">
              <img
                src="/ai-agent-logo.png"
                alt="KELVRIN AI"
                className="h-10 w-10 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200/60 shrink-0 mt-0.5"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/favicon.svg";
                }}
              />
              <div className="flex flex-col gap-2.5 w-full">
                <ThinkingTool 
                  state="thinking" 
                  content="Evaluating request against verified local enclave models, verifying statutory adequacy ratios, and formatting verified deliverable..." 
                  defaultOpen={true} 
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5 font-medium text-indigo-700">
                    <Cpu className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                    Local Sovereign Routing &amp; Verification Active
                  </span>
                  <Button 
                    variant="outline" 
                    size="xs" 
                    className="text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1 h-7 px-2.5 text-xs rounded-lg"
                    onClick={handleStopGeneration}
                  >
                    <Square className="h-3 w-3 fill-current" /> Stop
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error & Retry Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {lastPrompt && (
                <Button 
                  variant="outline" 
                  size="xs" 
                  className="bg-white text-red-700 hover:bg-red-50 shrink-0"
                  onClick={() => handleSend(lastPrompt)}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar with PromptInput */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center gap-2.5">
          {/* Grounding Document Bar / Selection */}
          {selectedDoc && (
            <div className="w-full max-w-4xl px-4 py-2 bg-blue-50/90 border border-blue-100 rounded-xl flex items-center justify-between text-xs sm:text-sm text-blue-900 shadow-xs">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="truncate">
                  Grounded Document: <strong>{selectedDoc.title}</strong> ({selectedDoc.filename})
                </span>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)} 
                className="text-blue-500 hover:text-blue-800 p-1"
                title="Remove attachment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* PromptInput Container */}
          <div className="w-full max-w-4xl flex flex-col items-center justify-center relative">
            <div className="w-full flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors ${
                    selectedDoc 
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Paperclip className="h-4 w-4" />
                  <span>{selectedDoc ? 'Document Grounded' : 'Ground on Document'}</span>
                </button>
              </div>

              {/* Document Picker Dropdown Modal */}
              {showDocPicker && (
                <div className="absolute bottom-16 left-0 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-3.5 text-xs sm:text-sm">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1 font-semibold text-slate-800">
                    <span>Select Enclave Document</span>
                    <button onClick={() => setShowDocPicker(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {readyDocs.length === 0 ? (
                      <div className="p-3 text-center text-slate-400">No READY documents found</div>
                    ) : (
                      readyDocs.map(doc => (
                        <button
                          key={doc.id}
                          onClick={() => {
                            setSelectedDoc(doc);
                            setShowDocPicker(false);
                          }}
                          className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div className="truncate pr-2">
                            <div className="font-medium text-slate-800 truncate">{doc.title}</div>
                            <div className="text-xs text-slate-400 truncate">{doc.filename}</div>
                          </div>
                          <Badge variant="neutral" size="sm">{doc.classification}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompt Shortcuts Bar */}
            <div className="w-full mb-2.5 overflow-x-auto pb-1 scrollbar-none flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                <span>Shortcuts:</span>
              </span>
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(qp.prompt)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 shadow-2xs transition-all flex items-center gap-1 hover:border-cyan-400 cursor-pointer"
                >
                  <span>{qp.icon}</span>
                  <span className="font-medium">{qp.label}</span>
                </button>
              ))}
            </div>

            <div className="w-full flex justify-center">
              <PromptInput
                onSubmit={(val, meta) => {
                  handleSend(val, meta);
                }}
                placeholder="Ask anything or request deliverables (.xlsx, .pdf, .docx, .pptx)..."
                models={
                  models.length > 0
                    ? ['Auto Air-Gap Router', ...models.map(m => m.name)]
                    : ['Auto Air-Gap Router', 'DeepSeek-R1-Distill-Qwen-14B', 'Llama-3.1-8B-Instruct', 'Mistral-Nemo-12B-Base']
                }
                efforts={['Low Effort', 'Medium Effort', 'Max Effort']}
              />
            </div>
          </div>

          <div className="w-full max-w-4xl flex items-center justify-between text-xs text-slate-400 px-2">
            <span>Press <strong>Enter</strong> to send • <strong>Shift + Enter</strong> for line break</span>
            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Kelvrin Sovereign Air-Gap Active
            </span>
          </div>
        </div>

      </div>

      {/* Deep Citation Inspector Modal */}
      {citationModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Quote className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Verified RAG Source Citation</h3>
                  <p className="text-xs text-slate-400">Exact grounding excerpt from vector chunk</p>
                </div>
              </div>
              <button
                onClick={() => setCitationModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-medium">Document:</span>
                  <div className="font-semibold text-slate-800 truncate">{citationModal.docName}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Page / Chunk:</span>
                  <div className="font-semibold text-slate-800">Page {citationModal.page} ({citationModal.chunkId})</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Semantic Similarity:</span>
                  <div className="font-semibold text-emerald-600 font-mono">{citationModal.similarity}% Cosine Match</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Air-Gap Status:</span>
                  <div className="font-semibold text-cyan-700">100% On-Premise Vector DB</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200 text-xs text-slate-800 leading-relaxed font-serif">
                <span className="bg-amber-200/80 px-1 py-0.5 rounded font-sans text-[10px] font-bold text-amber-900 uppercase tracking-wider mr-1.5">
                  Extracted Excerpt
                </span>
                {citationModal.text}
              </div>

              <div className="text-[10px] font-mono text-slate-400 truncate bg-slate-100 p-2 rounded-lg">
                SHA-256: {citationModal.sha256}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCitationModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Knowledge / Bookmarks Slide-over Drawer */}
      {isSavedDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <Bookmark className="h-4 w-4 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Saved Knowledge</h3>
                  <p className="text-xs text-slate-400">{savedResponses.length} bookmarked responses</p>
                </div>
              </div>
              <button
                onClick={() => setIsSavedDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {savedResponses.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center text-slate-400 text-xs">
                  <Bookmark className="h-10 w-10 text-slate-200 stroke-1 mb-2" />
                  <p className="font-semibold text-slate-600">No bookmarked responses yet</p>
                  <p className="text-[11px] mt-1 text-slate-400 max-w-xs">
                    Click the "Save" bookmark icon on any AI assistant response to pin it here for quick reference.
                  </p>
                </div>
              ) : (
                savedResponses.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate max-w-[200px]">{item.convTitle}</span>
                      <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-4 font-mono bg-white p-2 rounded border border-slate-100">
                      {item.content}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(item.content);
                          success('Copied', 'Saved response copied to clipboard.');
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => {
                          const updated = savedResponses.filter((s) => s.id !== item.id);
                          setSavedResponses(updated);
                          localStorage.setItem('kelvrin_saved_responses', JSON.stringify(updated));
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        title="Remove bookmark"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
