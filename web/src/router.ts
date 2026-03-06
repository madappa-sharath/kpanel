import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router'

// Shell + layouts
import { AppShell } from './components/shell/AppShell'
import { ClusterLayout } from './routes/clusters/$clusterId/__layout'
import { TopicLayout } from './routes/clusters/$clusterId/topics/$topicName/__layout'
import { GroupLayout } from './routes/clusters/$clusterId/consumer-groups/$groupId/__layout'

// Top-level pages
import { WelcomePage } from './routes/welcome'
import { SettingsPage } from './routes/settings/index'

// Cluster pages
import { DashboardPage } from './routes/clusters/$clusterId/index'
import { BrokersPage } from './routes/clusters/$clusterId/brokers/index'
import { BrokerDetailPage } from './routes/clusters/$clusterId/brokers/$brokerId'

// Topic pages
import { TopicsPage } from './routes/clusters/$clusterId/topics/index'
import { TopicOverviewPage } from './routes/clusters/$clusterId/topics/$topicName/index'
import { TopicPartitionsPage } from './routes/clusters/$clusterId/topics/$topicName/partitions'
import { TopicConfigPage } from './routes/clusters/$clusterId/topics/$topicName/config'
import { TopicMessagesPage } from './routes/clusters/$clusterId/topics/$topicName/messages'

// Consumer group pages
import { GroupsPage } from './routes/clusters/$clusterId/consumer-groups/index'
import { GroupMembersPage } from './routes/clusters/$clusterId/consumer-groups/$groupId/members'
import { GroupOffsetsPage } from './routes/clusters/$clusterId/consumer-groups/$groupId/offsets'
import { GroupLagPage } from './routes/clusters/$clusterId/consumer-groups/$groupId/lag'

// Metrics page
import { MetricsPage } from './routes/clusters/$clusterId/metrics/index'

// Cluster settings
import { ClusterSettingsPage } from './routes/clusters/$clusterId/settings/index'

// Schema + ACL pages
import { SchemasPage } from './routes/clusters/$clusterId/schemas/index'
import { SchemaLayout } from './routes/clusters/$clusterId/schemas/$schemaId/__layout'
import { SchemaDetailPage } from './routes/clusters/$clusterId/schemas/$schemaId/index'
import { AclsPage } from './routes/clusters/$clusterId/acls/index'

// ─── Root ────────────────────────────────────────────────────────────────────
// Bare root: just renders <Outlet /> so welcome page can be full-screen.
const rootRoute = createRootRoute({ component: Outlet })

// ─── Welcome (no shell) ──────────────────────────────────────────────────────
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  component: WelcomePage,
})

// ─── Shell layout (pathless) ─────────────────────────────────────────────────
// All routes that need the sidebar + header are nested under this.
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
})

// / → redirect to /welcome (or active cluster once store is wired)
const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/welcome' })
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: SettingsPage,
})

// ─── Cluster routes ──────────────────────────────────────────────────────────
const clusterRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/clusters/$clusterId',
  component: ClusterLayout,
})

const clusterIndexRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/',
  component: DashboardPage,
})

const brokersRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/brokers',
  component: BrokersPage,
})

const brokerDetailRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/brokers/$brokerId',
  component: BrokerDetailPage,
})

// ─── Topic routes ────────────────────────────────────────────────────────────
const topicsRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/topics',
  component: TopicsPage,
})

const topicRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/topics/$topicName',
  component: TopicLayout,
})

const topicIndexRoute = createRoute({
  getParentRoute: () => topicRoute,
  path: '/',
  component: TopicOverviewPage,
})

const topicPartitionsRoute = createRoute({
  getParentRoute: () => topicRoute,
  path: '/partitions',
  component: TopicPartitionsPage,
})

const topicConfigRoute = createRoute({
  getParentRoute: () => topicRoute,
  path: '/config',
  component: TopicConfigPage,
})

const topicMessagesRoute = createRoute({
  getParentRoute: () => topicRoute,
  path: '/messages',
  component: TopicMessagesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    partition: search.partition != null ? Number(search.partition) : undefined,
  }),
})

// ─── Consumer group routes ────────────────────────────────────────────────────
const groupsRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/consumer-groups',
  component: GroupsPage,
})

const groupRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/consumer-groups/$groupId',
  component: GroupLayout,
})

const groupMembersRoute = createRoute({
  getParentRoute: () => groupRoute,
  path: '/members',
  component: GroupMembersPage,
})

const groupOffsetsRoute = createRoute({
  getParentRoute: () => groupRoute,
  path: '/offsets',
  component: GroupOffsetsPage,
})

const groupLagRoute = createRoute({
  getParentRoute: () => groupRoute,
  path: '/lag',
  component: GroupLagPage,
})

// ─── Schema routes ────────────────────────────────────────────────────────────
const schemasRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/schemas',
  component: SchemasPage,
})

// schemaRoute acts as a layout (breadcrumb) parent, consistent with topicRoute/groupRoute
const schemaRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/schemas/$schemaId',
  component: SchemaLayout,
})

const schemaDetailRoute = createRoute({
  getParentRoute: () => schemaRoute,
  path: '/',
  component: SchemaDetailPage,
})

// ─── Metrics route ────────────────────────────────────────────────────────────
const clusterMetricsRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/metrics',
  component: MetricsPage,
})

// ─── Cluster settings route ───────────────────────────────────────────────────
const clusterSettingsRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/settings',
  component: ClusterSettingsPage,
})

// ─── ACL routes ───────────────────────────────────────────────────────────────
const aclsRoute = createRoute({
  getParentRoute: () => clusterRoute,
  path: '/acls',
  component: AclsPage,
})

// ─── Route tree ───────────────────────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  welcomeRoute,
  shellRoute.addChildren([
    indexRoute,
    settingsRoute,
    clusterRoute.addChildren([
      clusterIndexRoute,
      brokersRoute,
      brokerDetailRoute,
      topicsRoute,
      topicRoute.addChildren([
        topicIndexRoute,
        topicPartitionsRoute,
        topicConfigRoute,
        topicMessagesRoute,
      ]),
      groupsRoute,
      groupRoute.addChildren([
        groupMembersRoute,
        groupOffsetsRoute,
        groupLagRoute,
      ]),
      clusterMetricsRoute,
      schemasRoute,
      schemaRoute.addChildren([schemaDetailRoute]),
      aclsRoute,
      clusterSettingsRoute,
    ]),
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
