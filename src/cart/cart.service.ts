import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AddToCartInput } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  private async calculateCartTotal(cart: any): Promise<number> {
    return cart.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  }

  async getCartByUserId(userId: string) {
    const cart = await this.prisma.cart.findFirst({ // Use findFirst instead of findUnique
      where: { userId, isOrdered: false },  // Find active cart (not ordered)
      include: { items: { include: { product: true } } },
    });
  
    if (!cart) return null;
    const total = await this.calculateCartTotal(cart);
    return { ...cart, total };
  }
  

  async addToCart(input: AddToCartInput) {
    let cart = await this.prisma.cart.findFirst({
      where: { userId: input.userId, isOrdered: false },
      include: { items: true }
    });

    if (!cart || cart.isOrdered) {
      cart = await this.prisma.cart.create({
        data: { userId: input.userId, isOrdered: false },
        include: { items: true }
      });
    }

    const price = await this.prisma.price.findFirst({
      where: { productId: input.productId, size: input.size }
    });

    if (!price) throw new NotFoundException('Price not found for selected size');

    try {
      const existingItem = cart.items.find(item => 
        item.productId === input.productId && 
        item.size === input.size
      )
      if (existingItem) {
        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: { increment: input.quantity } },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: input.productId,
            size: input.size,
            price: price.value,
            quantity: input.quantity,
          },
        });
      }
    } catch (error) {
      throw new Error('Failed to update cart.');
    }

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    return { ...updatedCart, total: await this.calculateCartTotal(updatedCart) };
  }

  async removeCartItem(cartItemId: string) {
    const cartItem = await this.prisma.cartItem.delete({
      where: { id: cartItemId },
      include: { cart: true },
    });

    const updatedCart = await this.prisma.cart.findUnique({
      where: { id: cartItem.cart.id },
      include: { items: { include: { product: true }} },
    });

    return { ...updatedCart, total: await this.calculateCartTotal(updatedCart) };
  }
}
