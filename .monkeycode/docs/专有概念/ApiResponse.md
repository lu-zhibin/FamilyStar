# 统一 API 响应

FamilyStar API 使用判别联合信封保持 Web、未来 App 和小程序的响应契约一致。

## 成功信封

```typescript
type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  meta: {
    request_id: string;
    timestamp: string;
  };
};
```

## 失败信封

```typescript
type ApiErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
};
```

`code` 是可供客户端稳定分支处理的机器标识，`message` 是安全的通用描述，`details` 仅用于可公开的结构化错误信息。未处理异常不会把内部异常消息放入响应。

## 请求关联

API 接受由字母、数字、下划线和连字符组成的 1 至 128 位 `X-Request-Id`。有效值贯穿响应头、响应 `meta` 和结构化日志；其余输入由服务端生成 UUID 替换。

结构化请求日志只记录时间、级别、事件、请求 ID、HTTP 方法、路径、状态和耗时。查询值、请求体、Cookie、授权头和凭据均不进入请求日志。

## 单元测试

任务 1.5 使用类型断言验证 `ApiResponse<T>` 的判别联合，并验证响应构造器对成功数据、失败详情、请求 ID 和时间戳的处理。Hono 内存请求验证健康检查、404 和未处理异常都遵循该契约。
