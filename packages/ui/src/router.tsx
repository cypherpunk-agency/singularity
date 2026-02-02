import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppProvider } from './components/AppProvider';
import { Layout } from './components/Layout';
import { Chat } from './components/Chat';
import { Jobs } from './components/Jobs';
import { Files } from './components/Files';
import { Outputs } from './components/Outputs';
import { History } from './components/History';

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppProvider />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/chat" replace /> },
          { path: 'chat', element: <Chat /> },
          { path: 'jobs', element: <Jobs /> },
          { path: 'files', element: <Files /> },
          { path: 'files/*', element: <Files /> },
          { path: 'outputs', element: <Outputs /> },
          { path: 'outputs/:sessionId', element: <Outputs /> },
          { path: 'history', element: <History /> },
        ],
      },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);
