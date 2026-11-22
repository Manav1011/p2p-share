// Private-use code points mark placeholders; strip them from user input so they can't be forged.
const PH_OPEN = '';
const PH_CLOSE = '';

export const parseMarkdown = (text: string): string => {
    if (!text) return '';

    let html = text.replace(/[]/g, '');

    // Extract code blocks (escaped, then restored at the very end so no inline rule touches them)
    const codeBlocks: string[] = [];
    html = html.replace(/```([\s\S]*?)```/g, (_match, codeContent: string) => {
        const escapedCode = codeContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const index = codeBlocks.length;
        codeBlocks.push(`<pre class="bg-black/40 p-3 rounded-lg overflow-x-auto my-2 border-l-2 border-[#FF6500] font-mono text-sm"><code>${escapedCode}</code></pre>`);
        return `${PH_OPEN}${index}${PH_CLOSE}`;
    });

    // Escape HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-[#FF6500]/50 pl-3 my-2 italic text-gray-400">$1</blockquote>');

    // Lists
    const lines = html.split('\n');
    const result: string[] = [];
    let inBulletList = false;
    let inNumberedList = false;
    let bulletListItems: string[] = [];
    let numberedListItems: string[] = [];

    for (const line of lines) {
        if (line.includes(PH_OPEN)) {
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

    // Newlines to BR (protecting block elements)
    html = html.replace(/\n/g, (match, offset: number, string: string) => {
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

    // Restore code blocks last, with a function replacer so "$&" etc. in code stay literal
    html = html.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, 'g'), (_m, i: string) => codeBlocks[Number(i)]);

    return html;
};
