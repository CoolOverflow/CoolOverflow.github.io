## Python绘图工具turtle
偶然发现Python带有一个绘图库turtle，感觉还蛮好玩的，顺便记录一下
### 1.绘制爱心
```python
import turtle as t

length = 100
t.color('pink','red')
t.pensize(5)
t.begin_fill()
t.left(45)
t.forward(length)
t.circle(length / 2, 180)
t.right(90)
t.circle(length / 2, 180)
t.forward(length)
t.end_fill()
t.hideturtle()
t.exitonclick()
```
### 2.L系统
```python
from turtle import *

length = 4
angle = 60


def draw_path(path):
    for symbol in path:
        if symbol == 'l':
            forward(length)
        elif symbol == 'r':
            forward(length)
        elif symbol == '-':
            left(angle)
        elif symbol == '+':
            right(angle)


def apply_rule(path):
    str1 = path.replace("Fr", "a")
    str2 = str1.replace("Fl", "Fr+Fl+Fr")
    return str2.replace("a", "Fl-Fr-Fl")


path1 = "Fr"
speed(0)
# L系统基于规则分形迭代
for i in range(6):
    path1 = apply_rule(path1)
draw_path(path1)
exitonclick()
```
### 3.绘制饼干

```python
import turtle as t

# 绘制一个饼干
little_cur = 5
height = 70
draw_iter = 12
# 主体
t.color('orange')
t.right(90)
t.speed(0)
t.begin_fill()
for i in range(draw_iter):
    t.circle(little_cur, 180)
    t.left(180)
t.backward(height)
t.left(180)
for i in range(draw_iter):
    t.circle(little_cur, 180)
    t.left(180)
t.backward(height)
t.end_fill()

t.goto(little_cur * draw_iter, height / 2 - little_cur)
t.setheading(0)
t.color('brown')
t.begin_fill()
t.circle(little_cur)
t.end_fill()
t.speed(1)
for i in range(6):
    t.penup()
    t.left(60)
    t.goto(little_cur * draw_iter, height / 2)
    t.forward(15)
    t.pendown()
    t.begin_fill()
    t.circle(12, 90)
    t.circle(-2, 180)
    t.circle(-12, 90)
    t.forward(2)
    t.end_fill()
    t.left(180)

t.hideturtle()
t.exitonclick()
```
### 4.绘制渐进的多边形
```python
import turtle as t

t.bgcolor("black")
sides = eval(input("input edges in [2, 6]！"))
colors = ["red", "yellow", "green", "blue", "orange", "purple"]
for x in range(100):
    t.pencolor(colors[x % sides])
    t.forward(x * 3 / sides + x)
    t.left(360 / sides + 1)
    t.width(x * sides / 200)
t.exitonclick()
```



