# 来源资料约定

野外调查资料接收服务。当前登记扁平答卷摘要；调查网关提供按版本的表单定义、实例路径记录、重复组和附件状态。

## 交互与身份

GET /submission为单份摘要；GET /submissions列出instanceId/formVersion/revision/url。GET /forms/:version返回fields（path/relevant表达式原文/repeat）及mediaRequirements。GET /instances/:id含answers、askedPaths、repeats、deletedRepeatIds、media。repeat含instanceKey和answers，path使用实例键而非数组下标；askedPaths为来源当时实际展示字段，不由接收端重算。media.status为pending/available/notCaptured，url只有available才存在。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：revision、form-upgrade。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 已有收件边界

当前`src/reader.mjs`只收取/submission提供的已整理资料。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
