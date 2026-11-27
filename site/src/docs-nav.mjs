// Docs navigation. Used by the Starlight sidebar and by llms.txt, so both list
// the pages in the same order.
export const docsNav = [
  {
    label: 'Start',
    items: [
      ['Overview', 'index'],
      ['Installation', 'installation'],
      ['Connecting to Kafka', 'connecting'],
      ['AWS MSK', 'aws-msk'],
    ],
  },
  {
    label: 'Using kpanel',
    items: [
      ['Cluster overview and brokers', 'brokers'],
      ['Topics', 'topics'],
      ['Messages', 'messages'],
      ['Search', 'search'],
      ['Consumer groups', 'consumer-groups'],
      ['Write mode', 'write-mode'],
    ],
  },
  {
    label: 'Reference',
    items: [
      ['Configuration', 'configuration'],
      ['Security model', 'security'],
      ['Updates', 'updates'],
      ['Building from source', 'building-from-source'],
      ['FAQ', 'faq'],
      ['Troubleshooting', 'troubleshooting'],
    ],
  },
]

export const docPath = (slug) => (slug === 'index' ? '/docs/' : `/docs/${slug}/`)
