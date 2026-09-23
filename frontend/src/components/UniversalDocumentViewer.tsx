import React, { useState, useEffect } from 'react';
import { SovereignDocument } from '../services/api';
import { parseDocumentBlob, ParsedDocumentContent } from '../utils/officeParser';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  Image as ImageIcon,
  ChevronLeft, 
  ChevronRight, 
  Search,
  Layers,
  Table,
  CheckCircle2,
  FileCheck
} from 'lucide-react';

interface UniversalDocumentViewerProps {
  document: SovereignDocument;
  fileBlob?: Blob | null;
  fileUrl?: string | null;
  onDownload?: () => void;
}

export const UniversalDocumentViewer: React.FC<UniversalDocumentViewerProps> = ({
  document,
  fileBlob,
  fileUrl,
  onDownload
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [parsed, setParsed] = useState<ParsedDocumentContent | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // PPTX state
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [showAllSlides, setShowAllSlides] = useState<boolean>(false);

  // XLSX state
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [sheetSearch, setSheetSearch] = useState<string>('');

  const ext = (document.filename.split('.').pop() || '').toLowerCase();
  const mime = document.mime_type || '';

  useEffect(() => {
    let isMounted = true;
    async function parse() {
      try {
        setLoading(true);
        let blobToParse = fileBlob;
        if (!blobToParse && fileUrl && !fileUrl.startsWith('data:application/pdf') && !mime.includes('pdf') && !ext.match(/^(pdf|png|jpe?g|webp|gif|svg)$/)) {
          try {
            const res = await fetch(fileUrl);
            if (res.ok) {
              blobToParse = await res.blob();
            }
          } catch {}
        }

        if (blobToParse) {
          const result = await parseDocumentBlob(blobToParse, document.filename);
          if (isMounted) setParsed(result);
        } else if (fileUrl && (mime.includes('pdf') || ext === 'pdf' || mime.startsWith('image/') || ext.match(/^(png|jpe?g|webp|gif|svg)$/))) {
          if (isMounted) {
            setParsed({
              type: mime.startsWith('image/') || ext.match(/^(png|jpe?g|webp|gif|svg)$/) ? 'image' : 'pdf',
              title: document.title,
              rawText: document.content_preview || ''
            });
          }
        } else {
          // Parse from text / content preview fallback
          const raw = document.content_preview || '';
          if (ext === 'csv') {
            const rows = raw.split('\n').filter(Boolean).map(l => l.split(','));
            if (isMounted) setParsed({ type: 'csv', sheetData: { sheets: [{ name: 'CSV Records', rows }] }, rawText: raw });
          } else if (ext === 'docx' || ext === 'doc') {
            if (isMounted) setParsed({ type: 'docx', title: document.title, rawText: raw, docSections: [{ heading: 'Ingested Content', text: raw }] });
          } else if (ext === 'pptx' || ext === 'ppt') {
            if (isMounted) setParsed({ type: 'pptx', title: document.title, rawText: raw, presentation: { slides: [{ slideNumber: 1, title: document.title, bullets: raw.split('\n').filter(Boolean) }] } });
          } else if (ext === 'xlsx' || ext === 'xls') {
            const rows = raw.split('\n').filter(Boolean).map(l => l.split('|').map(c => c.trim()));
            if (isMounted) setParsed({ type: 'xlsx', title: document.title, rawText: raw, sheetData: { sheets: [{ name: 'Sheet 1', rows }] } });
          } else {
            if (isMounted) setParsed({ type: 'text', title: document.title, rawText: raw });
          }
        }
      } catch (err) {
        console.warn('[DocViewer] Parsing error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    parse();
    return () => {
      isMounted = false;
    };
  }, [document.id, fileBlob, fileUrl]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px] text-slate-500 gap-3">
        <LoadingSpinner size="md" />
        <span className="text-xs font-medium">Decoding and verifying sovereign document stream...</span>
      </div>
    );
  }

  // =========================================================================
  // 1. PDF VIEWER
  // =========================================================================
  if (parsed?.type === 'pdf' || ext === 'pdf' || mime.includes('pdf')) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-red-600" />
            <span className="text-xs font-bold text-slate-800">Sovereign PDF Reader</span>
            <Badge variant="neutral" size="sm">ISO 32000 Native</Badge>
          </div>
          <div className="flex items-center gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Full Screen
              </a>
            )}
            {onDownload && (
              <Button variant="outline" size="xs" onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
            )}
          </div>
        </div>

        {fileUrl ? (
          <div className="rounded-xl border border-slate-300 shadow-sm overflow-hidden bg-slate-800">
            <iframe
              src={fileUrl}
              title={document.title}
              className="w-full h-[620px] bg-white border-0"
            />
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
            <FileText className="h-10 w-10 text-red-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">PDF Document Cataloged</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click download to stream from the sovereign vault.</p>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 2. IMAGE VIEWER
  // =========================================================================
  if (parsed?.type === 'image' || mime.startsWith('image/') || ext.match(/^(png|jpe?g|webp|gif|svg)$/)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-bold text-slate-800">High-Resolution Image Asset</span>
            <Badge variant="info" size="sm">{ext.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Original Resolution
              </a>
            )}
            {onDownload && (
              <Button variant="outline" size="xs" onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-1" /> Download
              </Button>
            )}
          </div>
        </div>

        {fileUrl ? (
          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center min-h-[400px] max-h-[620px] overflow-hidden">
            <img
              src={fileUrl}
              alt={document.title}
              className="max-h-[580px] max-w-full rounded-lg shadow-md object-contain bg-white"
            />
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
            <ImageIcon className="h-10 w-10 text-purple-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">Image Asset Cataloged</p>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 3. POWERPOINT PRESENTATION VIEWER (.pptx / .ppt)
  // =========================================================================
  if (parsed?.type === 'pptx' || ext === 'pptx' || ext === 'ppt') {
    const slides = parsed?.presentation?.slides || [
      { slideNumber: 1, title: document.title, bullets: ['Slide Presentation Ingested'] }
    ];
    const currentSlide = slides[currentSlideIndex] || slides[0];

    return (
      <div className="space-y-4">
        {/* Presentation Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-600 text-white shadow-xs">
              <Presentation className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                PowerPoint Slide Deck Viewer
              </span>
              <span className="text-[11px] text-amber-800 font-medium">
                {slides.length} Slide{slides.length > 1 ? 's' : ''} Parsed &bull; Zero Cloud Egress
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowAllSlides(!showAllSlides)}
              className="bg-white text-slate-700 font-medium"
            >
              <Layers className="h-3.5 w-3.5 mr-1 text-orange-600" />
              {showAllSlides ? 'Slide by Slide' : 'All Slides Grid'}
            </Button>
            {onDownload && (
              <Button variant="primary" size="xs" onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download PPTX
              </Button>
            )}
          </div>
        </div>

        {/* Slide-by-Slide Mode */}
        {!showAllSlides ? (
          <div className="space-y-3">
            {/* 16:9 Presentation Canvas */}
            <div className="relative aspect-[16/9] w-full bg-slate-950 rounded-2xl border-2 border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between p-6 sm:p-10 text-white">
              {/* Background gradient & decorative accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-slate-950 to-slate-900 pointer-events-none" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Slide Top Metadata */}
              <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 font-mono border-b border-slate-800/80 pb-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  SLIDE {currentSlide.slideNumber} OF {slides.length}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{document.filename}</span>
              </div>

              {/* Slide Center Content */}
              <div className="relative z-10 space-y-4 my-auto">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                  {currentSlide.title}
                </h2>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-2">
                  {currentSlide.bullets.map((bullet, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed">
                      <span className="text-orange-400 mt-1 shrink-0 font-bold">&bull;</span>
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Slide Footer */}
              <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
                <span className="font-semibold text-slate-300 tracking-wide">Kelvrin Sovereign Presentation Enclave</span>
                <span className="font-mono text-slate-500">Confidential &bull; On-Premises</span>
              </div>
            </div>

            {/* Slide Navigation Controls */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                disabled={currentSlideIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Slide
              </Button>

              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlideIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === currentSlideIndex ? 'w-6 bg-orange-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
                    }`}
                    title={`Slide ${i + 1}`}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="xs"
                onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                disabled={currentSlideIndex === slides.length - 1}
              >
                Next Slide
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : (
          /* All Slides Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[580px] overflow-y-auto pr-1">
            {slides.map((slide, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setCurrentSlideIndex(idx);
                  setShowAllSlides(false);
                }}
                className="cursor-pointer bg-slate-900 hover:bg-slate-850 p-5 rounded-xl border-2 border-slate-800 hover:border-orange-500 transition-all text-white space-y-3 group shadow-md"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-orange-400">SLIDE {slide.slideNumber}</span>
                  <span className="group-hover:text-white transition-colors">Click to expand</span>
                </div>
                <h3 className="font-bold text-sm text-slate-100 line-clamp-1">{slide.title}</h3>
                <ul className="text-xs text-slate-300 space-y-1 line-clamp-3">
                  {slide.bullets.map((b, bi) => (
                    <li key={bi} className="truncate">&bull; {b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 4. WORD DOCUMENT VIEWER (.docx / .doc)
  // =========================================================================
  if (parsed?.type === 'docx' || ext === 'docx' || ext === 'doc') {
    const sections = parsed?.docSections || [
      { heading: document.title, text: parsed?.rawText || document.content_preview || '' }
    ];

    return (
      <div className="space-y-4">
        {/* Word Document Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/80 p-3 rounded-xl border border-blue-200">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Word Document Reader
              </span>
              <span className="text-[11px] text-blue-800 font-medium">
                {sections.length} Formatted Section{sections.length > 1 ? 's' : ''} &bull; Native Office Open XML
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => handleCopy(parsed?.rawText || '')}
              className="bg-white text-slate-700"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? 'Copied!' : 'Copy Text'}
            </Button>
            {onDownload && (
              <Button variant="primary" size="xs" onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download DOCX
              </Button>
            )}
          </div>
        </div>

        {/* Paper Container (Styled Word Page) */}
        <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-6 sm:p-10 max-h-[580px] overflow-y-auto space-y-6 font-serif">
          {/* Document Header Title */}
          <div className="border-b-2 border-slate-900/10 pb-4">
            <h1 className="text-2xl font-bold text-slate-900 font-sans tracking-tight">
              {document.title || document.filename}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-sans mt-1.5">
              <span>Classification: <strong className="text-slate-800">{document.classification}</strong></span>
              <span>&bull;</span>
              <span>Size: <strong>{(document.file_size_bytes / 1024).toFixed(1)} KB</strong></span>
              <span>&bull;</span>
              <span>Verified On-Premises</span>
            </div>
          </div>

          {/* Sections & Tables */}
          {sections.map((sec, idx) => (
            <div key={idx} className="space-y-2.5">
              {sec.heading && (
                <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight border-l-4 border-blue-600 pl-3 py-0.5">
                  {sec.heading}
                </h2>
              )}

              {/* Render Table */}
              {sec.isTable && sec.tableData && sec.tableData.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 font-sans text-xs my-3 shadow-2xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        {sec.tableData[0]?.map((head, hIdx) => (
                          <th key={hIdx} className="p-2.5 font-bold text-slate-800 border-r border-slate-200 last:border-r-0">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sec.tableData.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2.5 text-slate-700 border-r border-slate-100 last:border-r-0">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Regular Paragraphs */
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {sec.text}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. EXCEL SPREADSHEET / CSV VIEWER (.xlsx / .xls / .csv)
  // =========================================================================
  if (parsed?.type === 'xlsx' || parsed?.type === 'csv' || ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const sheets = parsed?.sheetData?.sheets || [{ name: 'Sheet 1', rows: [] }];
    const activeSheet = sheets[activeSheetIndex] || sheets[0];

    // Filter rows by search
    const filteredRows = activeSheet.rows.filter(row => {
      if (!sheetSearch.trim()) return true;
      const q = sheetSearch.toLowerCase();
      return row.some(c => c.toLowerCase().includes(q));
    });

    const headerRow = filteredRows[0] || [];
    const bodyRows = filteredRows.slice(1);

    return (
      <div className="space-y-3">
        {/* Spreadsheet Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50/80 p-3 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-xs">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                Excel Spreadsheet Grid Viewer
              </span>
              <span className="text-[11px] text-emerald-800 font-medium">
                {activeSheet.rows.length} Total Rows &bull; {sheets.length} Sheet{sheets.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cell Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                placeholder="Search spreadsheet cells..."
                className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 w-44"
              />
            </div>
            {onDownload && (
              <Button variant="primary" size="xs" onClick={onDownload}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download {ext.toUpperCase()}
              </Button>
            )}
          </div>
        </div>

        {/* Sheet Tabs */}
        {sheets.length > 1 && (
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1 overflow-x-auto text-xs font-semibold">
            {sheets.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveSheetIndex(idx);
                  setSheetSearch('');
                }}
                className={`py-1.5 px-3 rounded-t-lg transition-colors flex items-center gap-1.5 ${
                  idx === activeSheetIndex
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Interactive Spreadsheet Grid */}
        <div className="rounded-xl border border-slate-300 shadow-sm overflow-hidden bg-white max-h-[540px] overflow-auto">
          {filteredRows.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs">
              {/* Column Letter Headers (A, B, C...) */}
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-mono text-[11px] sticky top-0 z-10 shadow-2xs">
                  <th className="p-2 w-12 text-center bg-slate-200/80 border-r border-slate-300">#</th>
                  {headerRow.map((_, i) => (
                    <th key={i} className="p-2 font-bold border-r border-slate-300 last:border-r-0 min-w-[120px]">
                      {String.fromCharCode(65 + (i % 26))}
                    </th>
                  ))}
                </tr>
                {/* Real First Row / Headers */}
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-800">
                  <td className="p-2 text-center bg-slate-100 border-r border-slate-200 font-mono text-[10px] text-slate-400">
                    1
                  </td>
                  {headerRow.map((c, i) => (
                    <td key={i} className="p-2.5 border-r border-slate-200 last:border-r-0 font-bold bg-emerald-50/40">
                      {c || '—'}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.slice(0, 100).map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                    <td className="p-2 text-center bg-slate-50 border-r border-slate-200 font-mono text-[10px] text-slate-400">
                      {rIdx + 2}
                    </td>
                    {headerRow.map((_, cIdx) => (
                      <td key={cIdx} className="p-2.5 text-slate-700 border-r border-slate-100 last:border-r-0 font-mono">
                        {row[cIdx] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching rows found in this sheet.
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 6. DEFAULT RAW TEXT & CODE READER
  // =========================================================================
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">Document Content Stream</span>
          <Badge variant="neutral" size="sm">{document.filename}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => handleCopy(parsed?.rawText || document.content_preview || '')}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? 'Copied!' : 'Copy Text'}
          </Button>
          {onDownload && (
            <Button variant="primary" size="xs" onClick={onDownload}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </Button>
          )}
        </div>
      </div>

      <div className="bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs max-h-[550px] overflow-y-auto leading-relaxed border border-slate-800 whitespace-pre-wrap selection:bg-purple-900">
        {parsed?.rawText || document.content_preview || 'No text content available.'}
      </div>
    </div>
  );
};
