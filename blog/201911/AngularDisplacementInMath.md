## 3D数学中角位移的表示：矩阵、欧拉角和四元数

### 1. 角位移

物体方位（orientation）相对于已知方位旋转的量，称为角位移。我们一般用矩阵和四元数来表示“角位移”，用欧拉角来表示“方位”。

### 2. 矩阵形式表示
利用旋转矩阵能将一个坐标系中的物体转移到另一个坐标系中，比如：
$$ \vec A_0 = \begin{bmatrix}1&1&1 \end{bmatrix}$$
在Unity坐标系（左手坐标系）中，将其沿y轴旋转$90^o$,得到的向量为：
$$ \vec A_1 = \begin{bmatrix}1&1&-1 \end{bmatrix}$$
我们利用旋转矩阵可以进行测试，旋转矩阵R为(R为旋转后的单位正交坐标系在原单位正交坐标系内的坐标)
$$R = \begin{bmatrix}cos(90^o)&0&-sin(90^o)\\0&1&0\\sin(90^o)&0&cos(90^o)\end{bmatrix}$$
$$即 R = \begin{bmatrix}0&0&-1\\0&1&0\\1&0&0\end{bmatrix}$$
$$\begin{aligned} A_1  &= A_0·R\\
&= \begin{bmatrix}1&1&1 \end{bmatrix} · \begin{bmatrix}0&0&-1\\0&1&0\\1&0&0\end{bmatrix} \\
&= \begin{bmatrix}1&1&-1 \end{bmatrix}
\end{aligned}$$
#### 矩阵表示的特点
- 旋转矩阵是单位正交的（从单位正交矩阵到单位正交矩阵的变化）
- 可以多个旋转矩阵连接
- 图形API使用矩阵形式
- 占用空间比较大
- 使用不直观

### 3. 欧拉角
“heading-pitch-bank”（y-x-z）旋转约定，有一定的层级关系，先转y，再转x，再转z，绕的是物体的轴。

造成了一个著名的问题**万向锁**，当x（中间级的轴）旋转±$90^o$时，第一次的转轴y和第三次的转轴z完全相同。因此约定当pitch = ±$90^o$时，令bank = $0^o$。
####特点
- 一种情况对应无数种欧拉角
- 占用内存少
- 比较直观
- 万向锁
- 角位移插值时会出现万向锁，造成插值结果路径错误

### 4. 四元数
四元数记为[w,(x, y, z )]，对应复平面中实数乘以复数可以让其在复平面内旋转，四元数这个多元复数也能使三维向量旋转。

四元数的意义为：**绕单位向量n旋转$\theta$**
$$\begin{aligned} q &=  [cos(\theta/2) \quad sin(\theta/2) \vec n] \\
& = [cos(\theta/2) \quad sin(\theta/2)\vec n_x  \quad sin(\theta/2)\vec n_y \quad sin(\theta/2)\vec n_z]
\end{aligned}$$

利用将向量$p$绕向量$n$旋转$\theta$角得到新的向量$p'$(重新定义乘法后表达式可以更简单，这里不继续深入，有空再讲)$$p' = qpq^{-1}$$

四元数的差，从一个方位$a$到另一个方位$b$的角位移$d$,表示为：$$ad = b$$

四元数的点乘，计算与四维向量计算一致，得到一个标量，表示两个方位的接近程度。点乘结果越大，方向越接近。


四元数的对数表示为 $\log q = \log ([cos\alpha \quad \vec n sin\alpha])= [0 \quad \alpha \vec n]$
四元数的指数表示为 $\exp q = \exp ([0 \quad \alpha \vec n])= [cos\alpha \quad \vec n sin\alpha]$
即$\log{(\exp p)} = p$


四元数求幂为 $q = [cos\alpha \quad \vec n sin\alpha]$，那么$\xcancel{q^2 = [cos2\alpha \quad \vec n sin2\alpha]}$,四元数求幂表示的是最接近的，比如假设$q$为顺时针转$70^o$，那么$q^4$表示的不是顺时针转$280^o$而是逆时针转$80^o$。

四元数插值‘slerp’，类似两标量线性插值，计算两四元数之间的差（角度），在t时间内每次递增等量差值的一部分
四元数插值‘squad’，如果存在一连串需要插值的四元数，为了防止连接出的不连贯（达到$C^2$连续），选取一些中间控制点使得插值更连续。取
$$s_i = q_i \ e^{-{\log(q_{i+1}{q_i}^{-1})+\log(q_{i-1}{q_i}^{-1})}/4}$$

$$squad(q_i,q_{i+1},s_i,s_{i+1},h)=slerp(slerp(q_i,q_{i+1},h),slerp(s_i,s_{i+1},h),2h(1-h))$$

等之后有时间再推导一次，嘿嘿~

#### 特点
- 四元数的逆为$aa^{-1}=[1 \quad \vec 0])$,可以理解为反向旋转同样的度数，即等于其共轭($\vec n$变为-$\vec n$)
- 四元数满足结合律，不满足交换律
- 插值平滑，插值就（一定要）选它
- 和矩阵之间的转换较快
- 难


[返回主页](https://kimomi.github.io/)