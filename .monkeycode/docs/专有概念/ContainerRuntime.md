# 容器运行时

## 镜像构建

根级 `Dockerfile` 先复制 workspace manifest 和锁文件，通过 `pnpm install --frozen-lockfile` 恢复确定性依赖，并使用 BuildKit cache mount 复用 pnpm store。统一构建阶段执行全工作区构建，随后输出三个非 root 运行目标：

| 目标 | 命令 | 健康检查 |
|---|---|---|
| `web` | `node apps/web/server.js` | `http://127.0.0.1:3000/` |
| `api` | `node apps/api/dist/server.js` | `http://127.0.0.1:3001/api/v1/health` |
| `worker` | `node apps/api/dist/worker.js` | `http://127.0.0.1:3002/health` |

Web 使用 Next.js standalone 产物，构建阶段将 rewrite 目标固定为 Docker 内部地址 `http://api:3001`，避免运行产物回退到本机 API 地址。API 和 Worker 复用构建后的 workspace 与 Prisma Client，均以镜像内 `node` 用户运行。

## 开发编排

`compose.dev.yml` 组合 PostgreSQL 16、Redis 7、一次性迁移服务、API、Worker 和 Web。PostgreSQL 与 Redis 先通过健康检查，迁移服务成功退出后 API 与 Worker 启动，Web 再等待 API 健康。

开发环境仅将 `0.0.0.0:8098` 映射到 Web 3000。Web 通过内部地址 `http://api:3001` 转发 `/api`，其余服务仅连接 `internal` bridge 网络。开发镜像允许本地构建，并支持 `CACHE_TAG` 复用远端缓存。

## 生产编排

`compose.prod.yml` 使用相同的服务依赖和内部网络，唯一公开端口为 `0.0.0.0:8099`。生产要求显式提供 `FAMILYSTAR_IMAGE_REPOSITORY`、`IMAGE_TAG`、公开地址、数据库密码和凭证保险库配置，并从单一仓库拉取带 `-web`、`-api` 和 `-worker` 组件后缀的镜像标签。

开发基础标签使用 `dev-<YYYYMMDD>-<短 SHA>`，生产基础标签使用 `v<语义版本>-<短 SHA>`；Compose 为基础标签追加组件后缀。数据库与 Redis 数据通过命名 volume 持久化，迁移服务保持 `restart: 'no'`，应用服务使用 `unless-stopped`。

## 验证边界

容器契约测试静态验证 Docker targets、锁文件安装、非 root 用户、三类健康检查、Compose 服务集合、迁移依赖、内部网络、公开端口和生产镜像变量。当前 Agent 环境缺少 Docker CLI，真实镜像构建、Compose 解析和 PostgreSQL 迁移执行需在具备 Docker 的 CI 或部署节点完成。
