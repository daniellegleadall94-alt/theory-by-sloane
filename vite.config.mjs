import {defineConfig,loadEnv} from 'vite';
import {createCompanyApi} from './server/company-api.mjs';
export default defineConfig(({mode})=>{const env={...process.env,...loadEnv(mode,process.cwd(),'THEORY_')};const options={databasePath:env.THEORY_DATABASE_PATH||'.data/theory.sqlite',socialOptions:{env}};return {plugins:[{name:'theory-company-api',configureServer(server){const api=createCompanyApi(options);server.middlewares.use(api.middleware);server.httpServer?.once('close',api.close)},configurePreviewServer(server){const api=createCompanyApi(options);server.middlewares.use(api.middleware);server.httpServer?.once('close',api.close)}}]}});

