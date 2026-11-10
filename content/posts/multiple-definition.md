---
title: 两个同名类：一次 multiple definition 的排查
date: 2026-05-26
summary: 链接期报 multiple definition，指着的却是一段和业务毫无关系的代码。根因是两个静态库各定义了一个全局 PointCloudProcessor。
tags: [C++, 链接, 排错]
---

## 报错

给点云链路加了一个新的处理器之后，链接阶段炸了：

```text
multiple definition of `PointCloudProcessor::voxelize(...)'
```

第一反应是「我是不是在头文件里写了实现」。查了一遍，没有。又怀疑是重复编译了同一个 `.cpp`，也不是。

## 根因

这个工程里同时链了三个东西：

1. 新加的 GDK / PCL 点云处理器；
2. PointPillar 推理依赖的 OCL 静态库；
3. 其他公共库。

问题在于：**这两个静态库各自定义了一个全局的 `PointCloudProcessor`**。它们本来属于不同的来源，恰好同名；只要它们的符号同时被链接进来，链接器就会看到两份全局定义。

编译期一切正常——每个 `.cpp` 单独编译时，都只看到自己那一份声明。

## 修法

把 realtime 这边的类型收进命名空间：

```cpp
namespace gdk_interface {
    using PointT = pcl::PointXYZ;
    using PointCloudT = pcl::PointCloud<PointT>;

    class PointCloudProcessor {
        // ...
    };
}
```

实现文件同步进入同一命名空间；调用点用一行 alias 少改代码：

```cpp
using PointCloudProcessor = gdk_interface::PointCloudProcessor;
```

## 怎么确认真的修好了

不是「编译过了」就算完。这一步我用了 `nm`：

```bash
g++ -c src/pointcloud_processor.cpp -o /tmp/pc.o
nm -C /tmp/pc.o | grep PointCloudProcessor
```

期望看到的符号是：

```text
gdk_interface::PointCloudProcessor::voxelize(...)
```

而不是全局的 `PointCloudProcessor::voxelize(...)`。**符号表是链接问题的真相**，编译器不报错只是因为它在单独编译时看不到冲突。

## 复盘

这个 bug 提醒我两件事：

**静态库会偷偷把符号带进来。** 你以为只是「引用了某个头文件」，实际上链进来的是整个库的全局符号空间。第三方库尤其要注意，它们的类名往往很通用。

**链接错误优先看符号，不要看业务。** 报错指向的位置经常让人以为是业务代码写错了，但真正的信息在 `nm` 的输出里：谁定义了它、它属于哪个命名空间、有没有重复。

顺带一提，同一段时间里还有一个 FastDDS 的版本 warning 在刷屏——它看起来很像「根因」，实际只是噪音。这类干扰也是排查成本的一部分。
