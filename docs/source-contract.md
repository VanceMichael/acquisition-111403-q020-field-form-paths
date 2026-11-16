# 来源资料约定

野外调查资料接收服务。按表单修订领取完整答卷；调查网关提供按版本的表单定义、实例路径记录、重复组和附件状态。

## 交互与身份

GET /submission为单份摘要；GET /submissions列出instanceId/formVersion/revision/url。GET /forms/:version返回fields（path/relevant表达式原文/repeat）及mediaRequirements。GET /instances/:id含answers、askedPaths、repeats、deletedRepeatIds、media。repeat含instanceKey和answers，path使用实例键而非数组下标；askedPaths为来源当时实际展示字段，不由接收端重算。media.status为pending/available/notCaptured，url只有available才存在。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：revision、form-upgrade。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 收件边界

`src/reader.mjs`先取/submissions清单，再按清单条目领取/instances/:id完整答卷，并按答卷自身的formVersion领取/forms/:version表单定义：同一清单里不同版本的答卷各自使用当时的表单定义，后来换版不重新解释旧答卷。路径记录（askedPaths）按来源原样登记，接收端不求值relevant表达式；空白只区分为未提问、提问未答或重复组已删除，空值保持原样，不统一填空字符串。重复组按instanceKey保持身份，不按数组位置对齐不同修订的样方；deletedRepeatIds按来源原样保留，作为删组依据。附件状态原样登记：pending为等待资料、notCaptured为明确未拍摄，二者不互相改写；available的附件随即领取字节并按摘要归档，表单要求但来源尚未上报的附件按等待资料处理并标明未上报。每份答卷登记为已确认、等待资料或需人工核对：清单与答卷不一致、路径记录或答案超出表单定义、附件标记可领取但取回失败等情形进入需人工核对并附原因。记录携带所依据的来源凭据标识，归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
