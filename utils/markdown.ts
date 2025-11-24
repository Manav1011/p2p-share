export const parseMarkdown = (text: string): string => {
    if (!text) return '';
    
    let html = text;
    
    // Extract code blocks
    const codeBlocks: string[] = [];
    let codeBlockIndex = 0;
    html = html.replace(/```([\s\S]*?)```/g, (_match, codeContent) => {
        const escapedCode = codeContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
        codeBlocks.push(`<pre class="bg-black/40 p-3 rounded-lg overflow-x-auto my-2 border-l-2 border-[#FF6500] font-mono text-sm"><code>${escapedCode}</code></pre>`);
        codeBlockIndex++;
        return placeholder;
    });
    
    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-[#FF6500]/50 pl-3 my-2 italic text-gray-400">$1</blockquote>');
    
    // Lists
    const lines = html.split('\n');
    let result: string[] = [];
    let inBulletList = false;
    let inNumberedList = false;
    let bulletListItems: string[] = [];
    let numberedListItems: string[] = [];
    
    for (let line of lines) {
        if (line.includes('__CODE_BLOCK_')) {
            if (inBulletList) { result.push('<ul class="list-disc pl-6 my-2">' + bulletListItems.join('') + '</ul>'); bulletListItems = []; inBulletList = false; }
            if (inNumberedList) { result.push('<ol class="list-decimal pl-6 my-2">' + numberedListItems.join('') + '</ol>'); numberedListItems = []; inNumberedList = false; }
            result.push(line);
            continue;
        }
        
        const numberedMatch = line.match(/^(\d+)\. (.+)$/);
        if (numberedMatch) {
            if (inBulletList) { result.push('<ul class="list-disc pl-6 my-2">' + bulletListItems.join('') + '</ul>'); bulletListItems = []; inBulletList = false; }
            if (!inNumberedList) { inNumberedList = true; numberedListItems = []; }
            numberedListItems.push('<li>' + numberedMatch[2] + '</li>');
            continue;
        }
        
        const bulletMatch = line.match(/^[-*] (.+)$/);
        if (bulletMatch) {
            if (inNumberedList) { result.push('<ol class="list-decimal pl-6 my-2">' + numberedListItems.join('') + '</ol>'); numberedListItems = []; inNumberedList = false; }
            if (!inBulletList) { inBulletList = true; bulletListItems = []; }
            bulletListItems.push('<li>' + bulletMatch[1] + '</li>');
            continue;
        }
        
        if (inBulletList) { result.push('<ul class="list-disc pl-6 my-2">' + bulletListItems.join('') + '</ul>'); bulletListItems = []; inBulletList = false; }
        if (inNumberedList) { result.push('<ol class="list-decimal pl-6 my-2">' + numberedListItems.join('') + '</ol>'); numberedListItems = []; inNumberedList = false; }
        result.push(line);
    }
    
    if (inBulletList) result.push('<ul class="list-disc pl-6 my-2">' + bulletListItems.join('') + '</ul>');
    if (inNumberedList) result.push('<ol class="list-decimal pl-6 my-2">' + numberedListItems.join('') + '</ol>');
    
    html = result.join('\n');
    
    // Inline formatting
    html = html.replace(/`([^`\n]+)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-[#FF6500] font-mono text-sm">$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
    
    // Restore code blocks
    codeBlocks.forEach((codeBlock, index) => {
        html = html.replace(`__CODE_BLOCK_${index}__`, codeBlock);
    });
    
    // Newlines to BR (protecting block elements)
    html = html.replace(/\n/g, (match, offset, string) => {
        const before = string.substring(Math.max(0, offset - 50), offset);
        const after = string.substring(offset, Math.min(string.length, offset + 50));
        if (before.includes('<blockquote') || after.includes('</blockquote>') ||
            before.includes('<ul') || after.includes('</ul>') ||
            before.includes('<ol') || after.includes('</ol>') ||
            before.includes('<li>')) {
            return match;
        }
        return '<br>';
    });
    
    return html;
};