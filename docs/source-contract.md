# 来源资料约定

野外调查资料接收服务。按表单修订领取完整答卷：调查网关提供按版本的表单定义、实例路径记录、重复组和附件状态；接收端登记结构化答卷并保留每份答卷的当前状态与变化依据。

## 交互与身份

GET /submissions列出instanceId/formVersion/revision/url。GET /forms/:version返回fields（path/relevant表达式原文/repeat）及mediaRequirements。GET /instances/:id含answers、askedPaths、repeats、deletedRepeatIds、media。repeat含instanceKey和answers，path使用实例键而非数组下标；askedPaths为来源当时实际展示字段，不由接收端重算。media.status为pending/available/notCaptured，url只有available才存在。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：revision（来源修订：删组并补齐附件）、form-upgrade（表单换版并出现新实例）、media-late（同一来源修订下附件晚到）、media-broken（附件标记可用但地址失效）、media-unreported（表单要求附件但实例尚未登记）。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 已有收件边界

`src/reader.mjs`按/submissions清单领取全部实例，按实例当时的formVersion取表单定义快照嵌入记录，不重算旧答卷的跳题。空白答案按路径记录区分notAsked/unanswered，重复组删除以来源deletedRepeatIds为依据，空值保留null不填空字符串。重复组以instanceKey为身份。附件pending或未登记记为等资料，available时取回字节并按摘要登记，取不到记为需人工核对；只有来源明确notCaptured才表示没有拍照。每份答卷状态为confirmed/awaiting-data/needs-review，由`src/lineage.mjs`从持久化记录推导当前状态与版本间变化依据，跨重启一致。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
