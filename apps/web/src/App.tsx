import { ConfigProvider } from 'antd';
export function App() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#55223f', borderRadius: 6 } }}>
    <main className="scaffold"><p>BERKSHIRE HATHAWAY HOMESERVICES</p><h1>Gulf Properties</h1><p>Sales workspace · Demo in development</p></main>
  </ConfigProvider>;
}
