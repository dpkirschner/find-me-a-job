import React from 'react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

type CodeProps = React.ComponentProps<'code'> & {
  inline?: boolean
}

const components: Components = {
  p: (props) => <p className="whitespace-pre-wrap" {...props} />,
  a: (props) => (
    <a className="text-blue-600 underline" target="_blank" rel="noreferrer noopener" {...props} />
  ),
  pre: (props) => (
    <pre className="bg-gray-100 dark:bg-gray-900 rounded p-3 my-2 overflow-x-auto" {...props} />
  ),
  code: ({ inline, className, children, ...props }: CodeProps) =>
    inline ? (
      <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
}

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
      {children}
    </ReactMarkdown>
  )
}

export default MarkdownRenderer


